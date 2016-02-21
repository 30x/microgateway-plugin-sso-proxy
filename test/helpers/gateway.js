'use strict';

/*

!!! This is just to be used until the real microgateway can be integrated for testing purposes. !!!

*/

var http = require('http');
var https = require('https');
var path = require('path');
var url = require('url');
var vm = require('vm');
var _ = require('lodash');
var async = require('async');
var debug = require('debug')('gateway:main');

var double_slash_regex = /\/\/+/g;
var empty_buffer = new Buffer(0);

// implements the connect middleware api
module.exports = function main(plugins, config, logger, stats) {

  var connections = 0;
  var max_connections = limit(config.edgemicro.max_connections); // limit incoming connections

  var correlation_seq = 0;
  var plugins_reverse = _.clone(plugins).reverse();

  return function(req, res, next) {
    var correlation_id = correlation_seq++;
    logger.info({req: req, i: correlation_id}, 'req');
    debug('req', correlation_id, req.method, req.url);

    async.series(plugins.map(function(plugin) {
      return function(next) {
        if (config.edgemicro.plugins.sandbox) {
          if (plugin._sandbox) { // refresh
            plugin._sandbox.req = req;
            plugin._sandbox.res = res;
          } else { // create sandbox
            plugin._sandbox = {
              req: req,
              res: res
            };
            Object.keys(plugin).forEach(function(key) {
              plugin._sandbox[key] = plugin[key]; // copy handler to sandbox
            });
            plugin._context = vm.createContext(plugin._sandbox);
          }
        }
        if (plugin._sandbox && plugin._sandbox.onrequest && plugin._sandbox._onrequest) {
          plugin._sandbox.next = next;
          plugin._sandbox._onrequest.runInContext(plugin._context);
        } else if (plugin.onrequest) {
          plugin.onrequest(req, res, next);
        } else {
          next(); // plugin does not provide onrequest, carry on
        }
      }
    }), function(err, results) {
      if (err) { next(err) }
      else { accept(plugins, plugins_reverse, correlation_id, req, res, next) }
    });
  }

  function accept(aplugins, plugins_reverse, correlation_id, req, res, next) {

    if (connections >= max_connections) {
      res.statusCode = 429; // Too Many Requests
      debug('dropped', res.statusCode, req.method, req.url, req.headers);
      var toomany = Error('too many requests');
      toomany.status = res.statusCode;
      return next(toomany);
    }

    var reqUrl = req.reqUrl;
    var proxy = res.proxy;

    // try to pass through most of the original request headers unmodified
    var target_headers = _.clone(req.headers);

    if (configured(config, 'x-request-id')) {
      // https://devcenter.heroku.com/articles/http-request-id
      target_headers['x-request-id'] =
        config.uid + '.' + correlation_id.toString();
    }

    if (configured(config, 'x-forwarded-for')) {
      // append client address to the x-forwarded-for header
      var forwarded_for = target_headers['x-forwarded-for'];
      if (forwarded_for) forwarded_for += ', '; else forwarded_for = '';
      forwarded_for += req.socket.remoteAddress;
      target_headers['x-forwarded-for'] = forwarded_for;
    }

    var hostname = target_headers.host;
    if (hostname) { // might be missing (with an http-1.0 client for example)

      if (configured(config, 'x-forwarded-host')) {
        // append host heeader to the x-forwarded-host header
        var forwarded_host = target_headers['x-forwarded-host'];
        if (forwarded_host) forwarded_host += ', '; else forwarded_host = '';
        forwarded_host += hostname;
        target_headers['x-forwarded-host'] = forwarded_host;
      }

      var colon = hostname.indexOf(':');
      if (colon > 0) {
        hostname = hostname.substring(0, colon); // strip port if present
      }

      if (configured(config, 'via')) {
        // append our hostname (but not the port), if present, to the via header
        var via = target_headers['via'];
        if (via) via += ', '; else via = '';
        via += req.httpVersion + ' ' + hostname;
        target_headers['via'] = via;
      }

      // delete the original host header to let node fill it in for the target request
      delete target_headers.host;
      // delete the original content-length to let node fill it in for the target request
      if (target_headers['content-length']) delete target_headers['content-length'];
    }

    var target_path =
      proxy.parsedUrl.pathname +
      reqUrl.pathname.substr(proxy.basePathLength, reqUrl.pathname.length); // strip leading base_path
    if (reqUrl.search) target_path += reqUrl.search;
    target_path = target_path.replace(double_slash_regex, '/');

    var treqOptions = {
      hostname: proxy.parsedUrl.hostname,
      port: proxy.parsedUrl.port,
      path: target_path,
      method: req.method,
      headers: target_headers, // pass through the modified headers
      agent: proxy.agent
    };

    var treq = (proxy.secure ? https : http).request(treqOptions, function(tres) {
      logger.info({res: tres, d: Date.now()-start, i: correlation_id}, 'tres');
      debug('tres', correlation_id, tres.statusCode);

      async.series(plugins_reverse.map(function(plugin) {
        return function(next) {
          if (plugin._sandbox && plugin._sandbox.onresponse && plugin._sandbox._onresponse) {
            plugin._sandbox.next = next;
            plugin._sandbox._onresponse.runInContext(plugin._context);
          } else if (plugin.onresponse) {
            plugin.onresponse(req, res, tres, next);
          } else {
            next(); // plugin does not provide onresponse, carry on
          }
        }
      }), function(err, results) {

        stats.incrementStatusCount(tres.statusCode);
        stats.incrementResponseCount();

        // the size of the body will change if any of the plugins transform the content
        // delete the response content-length and let node recalculate it for the client request
        delete tres.headers['content-length'];

        // propagate response headers from target to client
        Object.keys(tres.headers).forEach(function(header) {
          // skip setting the 'connection: keep-alive' header
          // setting it causes gateway to not accept any more connections
          if (header !== 'connection') {
            res.setHeader(header, tres.headers[header]);
          }
        });
        res.statusCode = tres.statusCode;

        if (configured(config, 'x-response-time')) {
          res.setHeader('x-response-time', Date.now()-start);
        }
      });

// sdg - moved this block to callback ^
      //stats.incrementStatusCount(tres.statusCode);
      //stats.incrementResponseCount();
      //
      //// the size of the body will change if any of the plugins transform the content
      //// delete the response content-length and let node recalculate it for the client request
      //delete tres.headers['content-length'];
      //
      //// propagate response headers from target to client
      //Object.keys(tres.headers).forEach(function(header) {
      //  // skip setting the 'connection: keep-alive' header
      //  // setting it causes gateway to not accept any more connections
      //  if (header !== 'connection') {
      //    res.setHeader(header, tres.headers[header]);
      //  }
      //});
      //res.statusCode = tres.statusCode;
      //
      //if (configured(config, 'x-response-time')) {
      //  res.setHeader('x-response-time', Date.now()-start);
      //}

      tres.on('data', function(data) {
        if (data && !res.finished) {
          async.seq.apply(this, plugins_reverse.map(function(plugin) {
            return function(xdata, next) {
              if (plugin._sandbox && plugin._sandbox.ondata_response && plugin._sandbox._ondata_response) {
                plugin._sandbox.xdata = xdata;
                plugin._sandbox.next = next;
                plugin._sandbox._ondata_response.runInContext(plugin._context);
              } else if (plugin.ondata_response) {
                plugin.ondata_response(req, res, xdata, next);
              } else {
                return next(null, xdata); // plugin does not provide ondata_response, carry on
              }
            }
          }))(data, function(err, result) {
            if (result) res.write(result); // write transformed data to response
          });
        } else if (data) {
          logger.warn({res: res, i: correlation_id}, 'discarding data received after response sent');
        }
      });

      tres.on('end', function() {
        logger.info({res: res, d: Date.now()-start, i: correlation_id}, 'res');
        debug('tres end', correlation_id, tres.statusCode);
        async.seq.apply(this, plugins_reverse.map(function(plugin) {
          return function(xdata, next) {
            if (plugin._sandbox && plugin._sandbox.onend_response && plugin._sandbox._onend_response) {
              plugin._sandbox.xdata = xdata;
              plugin._sandbox.next = next;
              plugin._sandbox._onend_response.runInContext(plugin._context);
            } else if (plugin.onend_response) {
              plugin.onend_response(req, res, xdata, next);
            } else {
              return next(null, xdata); // plugin does not provide onend_response, carry on
            }
          }
        }))(empty_buffer, function(err, result) {
          res.end(result); // end response, sending transformed data (if any) to client
          next(err);
          connections--;
        });
      });

      tres.on('close', function() {
        debug('tres close', correlation_id);
        logger.info({res: res, d: Date.now()-start, i: correlation_id}, 'res close');
        async.series(plugins_reverse.map(function(plugin) {
          return function(next) {
            if (plugin._sandbox && plugin._sandbox.onclose_response && plugin._sandbox._onclose_response) {
              plugin._sandbox.next = next;
              plugin._sandbox._onclose_response.runInContext(plugin._context);
            } else if (plugin.onclose_response) {
              plugin.onclose_response(req, res, next);
            } else {
              next(); // plugin does not provide onclose_response, carry on
            }
          }
        }), function(err, results) {
          // close the client connection when our connection to the target is closed (ETIMEOUT etc)
          res.destroy();
          req.destroy();
        });
      });

      tres.on('error', function(err) {
        logger.warn({res: tres, d: Date.now()-start, i: correlation_id, err: err}, 'tres error');
        debug('tres error', correlation_id, err.stack);
        async.series(plugins_reverse.map(function(plugin) {
          return function(next) {
            if (plugin._sandbox && plugin._sandbox.onerror_response && plugin._sandbox._onerror_response) {
              plugin._sandbox.err = err;
              plugin._sandbox.next = next;
              plugin._sandbox._onerror_response.runInContext(plugin._context);
            } else if (plugin.onerror_response) {
              plugin.onerror_response(req, res, err, next);
            } else {
              next(); // plugin does not provide onerror_response, carry on
            }
          }
        }), function(e, results) {
          if (e) {
            next(e);
          } else {
            next(err);
          }
        });
      });
    });

    // write body
    req.on('data', function(data) {
      debug('req data', data ? data.length : 'null');
      async.seq.apply(this, plugins.map(function(plugin) {
        return function(xdata, next) {
          if (plugin._sandbox && plugin._sandbox.ondata_request && plugin._sandbox._ondata_request) {
            plugin._sandbox.xdata = xdata;
            plugin._sandbox.next = next;
            plugin._sandbox._ondata_request.runInContext(plugin._context);
          } else if (plugin.ondata_request) {
            plugin.ondata_request(req, res, xdata, next);
          } else {
            return next(null, xdata); // plugin does not provide ondata_request, carry on
          }
        }
      }))(data, function(err, result) {
        if (result) treq.write(result); // write transformed data to target
      });
    });

    req.on('end', function() {
      debug('req end');
      async.seq.apply(this, plugins.map(function(plugin) {
        return function(xdata, next) {
          if (plugin._sandbox && plugin._sandbox.onend_request && plugin._sandbox._onend_request) {
            plugin._sandbox.xdata = xdata;
            plugin._sandbox.next = next;
            plugin._sandbox._onend_request.runInContext(plugin._context);
          } else if (plugin.onend_request) {
            plugin.onend_request(req, res, xdata, next);
          } else {
            return next(null, xdata); // plugin does not provide onend_request, carry on
          }
        }
      }))(empty_buffer, function(err, result) {
        if (result) treq.end(result); // write transformed data to target
      });
    });

    var treqLogInfo = {
      m: treqOptions.method,
      u: treqOptions.path,
      h: treqOptions.hostname + ':' + treqOptions.port,
      i: correlation_id
    };

    treq.on('error', function(err) {
      logger.warn({req: treqLogInfo, d: Date.now()-start, i: correlation_id, err: err}, 'treq error');
      debug('treq error', correlation_id, err.stack);
      async.series(plugins.map(function(plugin) {
        return function(next) {
          if (plugin._sandbox && plugin._sandbox.onerror_request && plugin._sandbox._onerror_request) {
            plugin._sandbox.next = next;
            plugin._sandbox._onerror_request.runInContext(plugin._context);
          } else if (plugin.onerror_request) {
            plugin.onerror_request(req, res, next);
          } else {
            next(); // plugin does not provide onerror_request, carry on
          }
        }
      }), function(e, results) {
        if (e) {
          next(e);
        } else {
          res.statusCode = 502; // Bad Gateway
          next(err);
        }
        connections--;
      });
    });

    treq.on('close', function() {
      debug('treq close');
      async.series(plugins.map(function(plugin) {
        return function(next) {
          if (plugin._sandbox && plugin._sandbox.onclose_request && plugin._sandbox._onclose_request) {
            plugin._sandbox.next = next;
            plugin._sandbox._onclose_request.runInContext(plugin._context);
          } else if (plugin.onclose_request) {
            plugin.onclose_request(req, res, next);
          } else {
            next(); // plugin does not provide onclose_request, carry on
          }
        }
      }), function(e, results) {
        req.destroy();
        res.destroy();
        // next(e);
      });
    });

    var start = Date.now();
    connections++;

    // log target request options, minus agent
    logger.info(treqLogInfo, 'treq');

    debug('treq', correlation_id, connections, treqOptions.method,
      treqOptions.hostname, treqOptions.port, treqOptions.path);
    stats.incrementRequestCount();
  };
};

function configured(config, property) {
  if (config.headers) {
    var value = config.headers[property];
    return value ? value : typeof value === 'undefined'; // on if unspecified
  } else {
    return true; // on if no config.headers section
  }
}

function limit(value) {
  // use value if configured, numeric and positive, otherwise unlimited
  return value && typeof value === 'number' && value > 0 ? value : Infinity;
}
