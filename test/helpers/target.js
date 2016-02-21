'use strict'

const connect = require('connect')
const http = require('http')
const debug = require('debug')('plugin:sso-proxy')

module.exports.start = () => {
  const app = connect()

  app.use((req, res, next) => {

    debug('target hit %s %s %s', req.method, req._parsedUrl.path, req.headers.authorization)

    switch (req._parsedUrl.pathname) {

      case '/':
        return res.end('<html>Welcome.<p/><a href="/secured">secured</a></html>')

      case '/unsecured':
        return res.end('unsecured')

      case '/secured':
        if (!req.headers.authorization) return res.statusCode = 401, res.end('unauthorized')
        return res.end('secured')

      default:
        next()
    }
  })

  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen((err) => {
      if (err) return reject(err)
      app.port = server.address().port
      debug(`target listening on port ${app.port}`)
      return resolve(server)
    })
  })
}
