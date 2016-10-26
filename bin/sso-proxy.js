#!/usr/bin/env node

'use strict'

const proxy = require('../test/helpers/proxy')
const config = require('config')
const superagent = require('superagent')
const utils = require('./utils')
const urlLib = require('url')
const https = require('https')
const fs = require('fs')

// The rest of this module is written in 'Promises' style. Someone with the motivation might want to convert this function to that style
function getHostIPThen(callback) {
  var token = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token').toString()
  var cert = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt').toString()
  var ns = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/namespace').toString()
  var podName = process.env.POD_NAME

  var headers = {
      Authorization: `Bearer ${token}`
  }
  var options = {
    protocol: 'https:',
    hostname: 'kubernetes.default',
    cert: cert,
    rejectUnauthorized: false,
    path: `/api/v1/namespaces/${ns}/pods/${podName}`,
    method: 'GET',
    headers: headers
  }
  var clientReq = https.request(options, function(res) {
    res.setEncoding('utf8')
    var body = ''
    res.on('data', chunk => body += chunk)
    res.on('end', function() {
      if (res.statusCode == 200) {
        callback(null, JSON.parse(body).status.hostIP)
      } else {
        var err = `http-helper-functions: unable to resolve Host IP. statusCode: ${res.statusCode} body: ${body}`
        console.log(err)
        callback(err)
      }
    })
  })
  clientReq.on('error', function (err) {
    console.log(`http-helper-functions: unable to resolve Host IP: error ${err}`)
    callback(err)
  })
  clientReq.end()
}

// make this work in Passenger even if creating a fake target
// see: https://www.phusionpassenger.com/library/indepth/nodejs/reverse_port_binding.html
if (typeof(PhusionPassenger) !== 'undefined' && !config.proxies[0].url) {
  PhusionPassenger.configure({ autoInstall: false });
  config.edgemicro.port = 'passenger'
}

utils.getPublicKey(config)
  .then(publicKey => {
    config.sso.public_key = publicKey
    return getTarget(config)
  })
  .then(target => {
    console.log(`proxy target: ${target}`)
    // If there isn't already a proxy configured, configure one with a default base_path of /.  Otherwise, update the
    // first proxy with the provided target.
    if (!config.proxies[0]) {
      config.proxies[0] = {
        base_path: '/',
        url: target
      }
    } else {
      config.proxies[0].url = target
    }
    return proxy.start(config, target)
  })
  .then(server => {
    this.server = server
    console.log(`proxy port ${server.address().port}`)
  })
  .catch(err => {
    console.log(err instanceof Error ? err.stack : err)
    process.exit(1)
  })

function getTarget (config) {
  // Ensure that config.proxies is set to something to avoid validating it below
  if (!config.proxies) {
    config.proxies = []
  }

  return new Promise((resolve, reject) => {
    // Either use a pre-provided proxy, get the proxy details from the SSO_PROXY_TARGET environment variable or use the
    // dummy target. (In the case of bin/target.js, we will always use the dummy target.)
    function primGetTarget(base_path, target_url_string) {
      config.proxies.unshift({
        base_path: base_path,
        url: target_url_string
      })
      console.log('Target URL:', config.proxies[0].url)
      resolve(config.proxies[0].url)
    }
    if (config.proxies[0] && config.proxies[0].url) {
      resolve(config.proxies[0].url)
    } else if (process.env.SSO_PROXY_TARGET) {
      const proxyParts = process.env.SSO_PROXY_TARGET.split('->')

      if (proxyParts.length !== 2) {
        reject('Invalid SSO_PROXY_TARGET value.  Expected format: {BASE_PATH}->{URL}')
      } else {
        // Prepend the proxy to ensure that it gets used
        var base_path = proxyParts[0].trim()
        var target_url_string = proxyParts[1].trim()
        var target_url = urlLib.parse(target_url_string)
        if (target_url.hostname = 'kubernetes_host_ip') 
          getHostIPThen(function(err, hostIP) {
            if (err)
              process.exit(1)
            else {
              target_url.hostname = hostIP
              target_url.host = undefined
              primGetTarget(base_path, urlLib.format(target_url))
            }
          })
        else
          primGetTarget(base_path, target_url_string)
      }
    } else {
      utils.startDummyTarget(config)
        .then(resolve, reject)
    }
  })
}
