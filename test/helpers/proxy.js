'use strict'

const connect = require('connect')
const http = require('http')
const debug = require('debug')('test:proxy')
const url = require('url')

module.exports.start = (config, target) => {

  const plugin = require('../../lib').init(config)

  // this is the minimal configuration required for gateway to run...
  const conf = { edgemicro: { plugins: {} } }
  const noop = () => {}
  const stats = { incrementStatusCount: noop, incrementResponseCount: noop, incrementRequestCount: noop }
  const logger = { info: noop, warn: noop }
  const calltarget = require('./gateway')([plugin], conf, logger, stats)
  const proxy = {
    parsedUrl: url.parse(target),
    basePathLength: 1,
    secure: false,
    agent: new http.Agent({ maxSockets: 1,  keepAlive: true })
  }

  const app = connect()

  app.use((req, res, next) => {
    res.proxy = proxy
    req.reqUrl = url.parse(req.url, true);
    calltarget(req, res, next)
  })

  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(config.port || 0, (err) => {
      if (err) return reject(err)
      debug(`proxy listening on port ${server.address().port}`)
      return resolve(server)
    })
  })
}
