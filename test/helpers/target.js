'use strict'

const connect = require('connect')
const http = require('http')
const debug = require('debug')('plugin:sso-proxy')
const jwt = require('jsonwebtoken')
const authHeaderRegex = /Bearer (.+)/i
const bodyParser = require('body-parser').urlencoded({ extended: false })
const jwtOptions = {
  algorithms: ['RS256'],
  ignoreExpiration: false,
  audience: undefined,
  issuer: undefined
}

module.exports.start = (keys, port) => {
  if (!port) port = 0
  const app = connect()

  app.use(bodyParser)

  app.use((req, res, next) => {

    debug('target hit %s %s %o', req.method, req._parsedUrl.path, req.headers)

    switch (req._parsedUrl.pathname) {

      case '/':
        res.end('<html>Welcome.<p/><a href="/secured">secured</a></html>')
        break

      case '/unsecured':
        res.end('unsecured')
        break

      case '/secured':
        if (!req.headers.authorization) {
          if (req.headers['x-restart-url-from-target']) {
            res.setHeader('x-restart-url', req.headers['x-restart-url-from-target'])
          }
          res.statusCode = 401
          return res.end('unauthorized')
        }
        const token = authHeaderRegex.exec(req.headers.authorization)[1]
        jwt.verify(token, keys.publicKey, jwtOptions, (err) => {
          if (err) return next(err)
          res.end('secured')
        })
        break

      case '/oauth/authorize':
        const query = require('url').parse(req.url, true).query
        const state = encodeURIComponent(query.state)
        const redirectUri = `${query.redirect_uri}?state=${state}&code=l33t`
        res.writeHead(302, { location: redirectUri })
        res.end()
        break

      case '/oauth/token':
        if (req.body.refresh_token) {
          jwt.verify(req.body.refresh_token, keys.publicKey, jwtOptions, (err) => {
            if (err) return next(err)
            res.end(JSON.stringify(createToken()))
          })
        } else {
          res.end(JSON.stringify(createToken()))
        }
        break

      default:
        next()
    }
  })

  function createToken() {
    const token = {
      scope: [ 'openid' ],
      client_id: 'ssoproxy',
      cid: 'ssoproxy',
      azp: 'ssoproxy',
      grant_type: 'authorization_code',
      user_id: 'babc13cf-ce9b-404c-9c12-1cdab3948271',
      user_name: 'SGanyo@apigee.com',
      email: 'SGanyo@apigee.com',
      rev_sig: '40e4dc96',
      zid: 'uaa'
    }
    const options = {
      expiresIn: 1,
      notBefore: 0,
      audience: [ 'ssoproxy', 'openid' ],
      subject: 'babc13cf-ce9b-404c-9c12-1cdab3948271',
      issuer: 'https://login.e2e.apigee.net/oauth/token',
      algorithm: 'RS256'
    }
    return {
      access_token: jwt.sign(token, keys.privateKey, options)
    }
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(port, (err) => {
      if (err) return reject(err)
      app.port = server.address().port
      debug(`target listening on port ${app.port}`)
      return resolve(server)
    })
  })
}
