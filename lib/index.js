'use strict'

const debug = require('debug')('plugin:sso-proxy')
const jwt = require('jsonwebtoken')
const request = require('request')
const url = require('url')

const passport = require('passport')
const PassportStrategy = require('./passport_strategy')
const Cookies = require('cookies')
const refresh = require('passport-oauth2-refresh')

const ssoStrategy = 'sso_provider'
const ssoCallbackUri = '/auth/sso/callback'
const authHeaderRegex = /Bearer (.+)/
const jwtOptionsDefault = {
  algorithms: ['RS256'],
  ignoreExpiration: false,
  audience: undefined,
  issuer: undefined
}
const accessTokenCookie = 'access_token'
const refreshTokenCookie = 'refresh_token'
const redirectPathCookie = 'redirect_path'
const minCookieLifeSecs = 10

const passportAuthenticateOpts = { session: false }

module.exports.init = function init(config, logger, stats) {

  const required_options = ['public_key', 'oauth' ]
  required_options.forEach(opt => { if (!config[opt]) throw new Error(`${opt} is required`) })

  const jwt_options = config.jwt_options || jwtOptionsDefault

  const strategy = new PassportStrategy(config.oauth, passportVerify)
  passport.use(ssoStrategy, strategy)
  refresh.use(ssoStrategy, strategy)

  return {
    onrequest,
    onresponse
  }

  function passportVerify(accessToken, refreshToken, profile, next) {
    verifyJWT(accessToken)
      .then(parsedToken => next(null, { accessToken, parsedToken, refreshToken }))
      .catch(next)
  }

  // plugin handler
  function onrequest(req, res, next) {
    debug('onrequest %s %s %o', req.method, req.reqUrl.path, req.headers)

    // SSO callback request
    if (req.method === 'GET' && req.reqUrl.pathname === ssoCallbackUri) {
      authenticate(req, res, err => {
        if (err) return next(err)

        const cookies = new Cookies(req, res)
        const redirectPath = cookies.get(redirectPathCookie)
        if (!redirectPath) return next('authenticated') // todo: default redirect?

        debug('redirecting to %s', redirectPath)
        cookies.set(redirectPathCookie) // delete the cookie
        res.writeHead(302, { location: redirectPath })
        res.end()
      })
    } else {
      // normal request
      checkToken(req, res, next)
    }
  }

  // plugin handler
  // todo: This WILL NOT WORK with real microgateway because...
  //       1. this is not the standard callback - added tres to determine the target response code
  //       2. microgateway will process target response events regardless of what I do here
  function onresponse(req, res, tres, next) {

    if (tres.statusCode !== 401) return next()

    // store original path for reissuing after authentication
    if (req.method === 'GET') new Cookies(req, res).set(redirectPathCookie, req.reqUrl.path)

    debug('invalid auth, start oauth flow')
    authenticate(req, res, next)
  }

  function authenticate(req, res, next) {

    if (!req.query) req.query = req.reqUrl.query

    passport.authenticate(ssoStrategy, passportAuthenticateOpts, (err, user, info) => {

      debug('authenticate %o %o %o', err, user, info)

      if (err) return next(err)
      if (!user) return sendError(res, 400, 'Unable to authenticate')

      setCookies(req, res, user.accessToken, user.refreshToken)
      next()

    })(req, res, next)
  }


  function checkToken(req, res, next) {

    let token = undefined

    if (req.headers.authorization) {
      const header = authHeaderRegex.exec(req.headers.authorization)
      if (!header || header.length < 2) return sendError(res, 400, 'Invalid Authorization header')
      token = header[1]
    } else {
      token = new Cookies(req, res).get(accessTokenCookie)
    }

    if (!token) return next()

    verifyJWT(token)
      .then(parsedToken => {
        debug('valid token %o', parsedToken)
        setDownstreamHeaders(req, token, parsedToken)
        next()
      })
      .catch(err => {
        debug('token error %o', err)
        try {
          if (err.name !== 'TokenExpiredError') return sendError(res, 401, `JWT Token error: ${err.message}`)
          const refreshToken = new Cookies(req, res).get(refreshTokenCookie)
          if (!refreshToken) return sendError(res, 401, `JWT Token error: ${err.message}`)

          debug('expired token, attempting refresh')
          refresh.requestNewAccessToken(ssoStrategy, refreshToken, (err, accessToken, refreshToken) => {

            debug('refresh %o %s %s', err, accessToken, refreshToken)
            setCookies(req, res, accessToken, refreshToken)
            next()
          })
        } catch (err) {
          next(err)
        }
      })
  }

  function setCookies(req, res, accessToken, refreshToken) {

    debug('setting auth cookies')

    const access = jwt.decode(accessToken)
    const refresh = jwt.decode(refreshToken)
    const expSecs = Math.max((refresh ? refresh.exp : 0), (access ? access.exp : 0), (Date.now() + minCookieLifeSecs))
    const expires = new Date(expSecs * 1000)

    const cookies = new Cookies(req, res)
    cookies.set(accessTokenCookie, accessToken, { expires })
    cookies.set(refreshTokenCookie, refreshToken, { expires })
  }

  function setDownstreamHeaders(req, token, parsedToken) {
    req.headers.authorization = req.headers.authorization || `Bearer ${token}`
  }

  function verifyJWT(token) {

    return new Promise((resolve, reject) => {
      jwt.verify(token, config.public_key, jwt_options, (err, token) => {
        if (err) return reject(err)
        resolve(token)
      })
    })
  }

  function sendError(res, code, message) {
    var response = {
      error: code,
      error_description: message
    }

    if (!res.finished) res.setHeader('content-type', 'application/json')
    res.statusCode = code
    res.end(JSON.stringify(response))
  }
}
