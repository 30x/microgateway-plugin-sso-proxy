'use strict'

const debug = require('debug')('plugin:sso-proxy')
const jwt = require('jsonwebtoken')
const url = require('url')

const passport = require('passport')
const PassportStrategy = require('./passport_strategy')
const Cookies = require('cookies')
const refresh = require('passport-oauth2-refresh')

const ssoStrategy = 'sso_provider'
const authHeaderRegex = /Bearer (.+)/i
const jwtOptionsDefault = {
  algorithms: ['RS256'],
  ignoreExpiration: false,
  audience: undefined,
  issuer: undefined
}
const accessTokenCookie = 'access_token'
const refreshTokenCookie = 'refresh_token'
const restartUrlHeader = 'x-restart-url'
const minCookieLifeSecs = 10

const passportAuthenticateOpts = { session: false }

module.exports = function init(config, logger, stats) {

  debug('config: %o', config)
  const required_options = ['public_key', 'oauth' ]
  required_options.forEach(opt => { if (!config[opt]) throw new Error(`${opt} is required`) })

  const jwt_options = config.jwt_options || jwtOptionsDefault

  const strategy = new PassportStrategy(config.oauth, passportVerify)
  passport.use(ssoStrategy, strategy)
  refresh.use(ssoStrategy, strategy)

  const oauthCallbackPath = url.parse(config.oauth.callbackURL).path

  return {
    onrequest,
    onresponse
  }

  function passportVerify(accessToken, refreshToken, profile, next) {
    debug('passportVerify')
    verifyJWT(accessToken)
      .then(parsedToken => next(null, { accessToken, parsedToken, refreshToken }))
      .catch(next)
  }

  // plugin handler
  function onrequest(req, res, data, next) {
    debug('onrequest %s %s %o', req.method, req.reqUrl.path, req.headers)

    // SSO callback request
    if (req.method === 'GET' && req.reqUrl.pathname === oauthCallbackPath) {
      authenticate(req, res, err => {
        if (err) return next(err)

        const redirectPath = req.query.state

        /* istanbul ignore next - this shouldn't happen */
        if (!redirectPath) return next('authenticated')

        debug('redirecting to %s', redirectPath)
        res.writeHead(302, { location: redirectPath })
        res.end()
      })
    } else {
      // normal request
      checkToken(req, res, next)
    }
  }

  // plugin handler
  function onresponse(req, res, data, next) {

    if (data.targetResponse.statusCode !== 401) return next()

    debug('invalid auth, start oauth flow')
    const callback = encodeURIComponent(config.oauth.callbackURL)
    const clientId = encodeURIComponent(config.oauth.clientID)

    // do a 401 redirect
    let redirectUrl = `${config.oauth.authorizationURL}?response_type=code&redirect_uri=${callback}&client_id=${clientId}`
    if (req.method === 'GET') {
      const restartUrl = req.headers[restartUrlHeader] || data.targetResponse.headers[restartUrlHeader] || req.url
      const state = encodeURIComponent(restartUrl)
      redirectUrl += `&state=${state}`
    }

    const body = `<head><meta http-equiv="refresh" content="0; url=${redirectUrl}"></head>\n`
                + `<a href="${redirectUrl}">${redirectUrl}</a>`
    res.writeHead(401, { location: redirectUrl })
    res.end(body)
  }

  function authenticate(req, res, next) {

    if (!req.query) req.query = req.reqUrl.query

    passport.authenticate(ssoStrategy, passportAuthenticateOpts, (err, user, info) => {
      debug('authenticate %o %o %o', err, user, info)

      if (err) return sendError(req, res, 500, err)
      /* istanbul ignore next - this shouldn't happen */
      if (!user) return sendError(req, res, 400, 'Unable to authenticate')

      setCookies(req, res, user.accessToken, user.refreshToken)
      next()

    })(req, res, next)
  }


  function checkToken(req, res, next) {

    let token = undefined

    if (req.headers.authorization) {
      const header = authHeaderRegex.exec(req.headers.authorization)
      if (!header || header.length < 2) return sendError(req, res, 400, 'Invalid Authorization header')
      token = header[1]
    } else {
      token = new Cookies(req, res).get(accessTokenCookie)
    }

    if (!token) return next()

    verifyJWT(token)
      .then(parsedToken => {
        debug('valid token %o', parsedToken)
        setDownstreamHeaders(req, token)
        next()
      })
      .catch(err => {
        debug('token error %o', err)
        try {
          // todo: deal with public key refresh as needed
          if (err.name !== 'TokenExpiredError') return sendError(req, res, 401, `JWT Token error: ${err.message}`)
          const refreshToken = new Cookies(req, res).get(refreshTokenCookie)

          if (!refreshToken) {
            setDownstreamHeaders(req)
            return next()
          }

          debug('expired token, attempting refresh')
          refresh.requestNewAccessToken(ssoStrategy, refreshToken, (err, accessToken, refreshToken) => {

            debug('refresh %o %s %s', err, accessToken, refreshToken)
            setCookies(req, res, accessToken, refreshToken)
            setDownstreamHeaders(req, accessToken)
            next()
          })
        } catch (err) { /* istanbul ignore next */
          next(err)
        }
      })
  }

  function setCookies(req, res, accessToken, refreshToken) {

    debug('setting auth cookies access: %s refresh: %s', !!accessToken, !!refreshToken)

    const access = jwt.decode(accessToken)
    const refresh = jwt.decode(refreshToken)
    const expSecs = Math.max((refresh ? refresh.exp : 0), (access ? access.exp : 0), (Date.now() / 1000 + minCookieLifeSecs))
    const expires = new Date(expSecs * 1000)

    const cookies = new Cookies(req, res)
    cookies.set(accessTokenCookie, accessToken, { expires, httpOnly: false })
    cookies.set(refreshTokenCookie, refreshToken, { expires, httpOnly: false })
  }

  function setDownstreamHeaders(req, token) {
    if (!token) {
      delete req.headers.authorization
    } else {
      req.headers.authorization = `Bearer ${token}`
    }
  }

  function verifyJWT(token) {

    return new Promise((resolve, reject) => {
      jwt.verify(token, config.public_key, jwt_options, (err, token) => {
        if (err) return reject(err)
        resolve(token)
      })
    })
  }

  function sendError(req, res, code, message) {
    var response = {
      error: code,
      error_description: message
    }

    debug('error (%s): %s', code, message)
    debug('  Authorization: %s', req.headers.authorization || '<no Authorization header provided>')

    if (!res.finished) res.setHeader('content-type', 'application/json')
    res.statusCode = code
    res.end(JSON.stringify(response))
  }
}
