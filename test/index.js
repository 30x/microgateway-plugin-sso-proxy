'use strict'

process.env.NODE_ENV = 'test'
const config = require('config')

const should = require('should')
const request = require('supertest')
const target = require('./helpers/target')
const proxy = require('./helpers/proxy')
const pem = require('pem')
const jwt = require('jsonwebtoken')
const cookie = require('cookie')

describe('oauth-proxy', () => {

  before(function(done) {
    Promise
      .all([
        createKeys(),
        target.start()
      ])
      .then(results => {
        this.keys = results[0]
        this.target = results[1]

        this.config = config
        this.config.public_key = this.keys.publicKey

        proxy
          .start(this.config, `http://localhost:${this.target.address().port}`)
          .then(server => {
            this.server = server
          })
          .then(done)
      })
      .catch(err => {
        console.log(err.stack)
      })
  })

  it('should allow no auth GET to unsecured endpoint', function(done) {
    request(this.server)
      .get('/unsecured')
      .expect(200)
      .end(done)
  })

  // todo: must this be a 401 w/ javascript redirect? does it differ between browser & api?
  it('should intercept 401 response and return redirect to auth', function(done) {
    const location = new RegExp(this.config.oauth.authorizationURL)
    request(this.server)
      .get('/secured')
      .expect(302)
      .expect('location', location)
      .expect('set-cookie', /redirect_path/)
      .end((err, res) => {
        if (err) return done(err)
        done()
      })
  })

  describe('api header', () => {

    it('should allow valid auth GET to unsecured endpoint', function(done) {
      request(this.server)
        .get('/unsecured')
        .set('Authorization', `Bearer ${createJWTToken(this.keys)}`)
        .expect(200)
        .end(done)
    })

    it('should reject expired requests with no refresh token', function(done) {
      const token = createJWTToken(this.keys, 0)
      request(this.server)
        .get('/secured')
        .set('Authorization', `Bearer ${token}`)
        .expect(401)
        .end(done)
    })

    // todo: header expectation for refresh token?
  })

  describe('browser cookie', () => {

    it('should allow valid auth GET to unsecured endpoint', function(done) {

      const token = createJWTToken(this.keys);
      var cookieHeader = cookie.serialize('access_token', token)
      request(this.server)
        .get('/unsecured')
        .set('Cookie', cookieHeader)
        .expect(200)
        .end(done)
    })

    it('should reject expired requests with no refresh token', function(done) {
      const token = createJWTToken(this.keys, 0)
      var cookieHeader = cookie.serialize('access_token', token)
      request(this.server)
        .get('/secured')
        .set('Cookie', cookieHeader)
        .expect(401)
        .end(done)
    })

    // todo: verify this actually happened
    it('should try to refresh token if token has expired', function(done) {
      const token = createJWTToken(this.keys, 0)
      const refreshToken = createJWTToken(this.keys)
      var cookieHeader = cookie.serialize('access_token', token) + ';' + cookie.serialize('refresh_token', refreshToken)
      request(this.server)
        .get('/secured')
        .set('Cookie', cookieHeader)
        .expect(302)
        .end(done)
    })

    it('should start auth flow for expired requests when no refresh token')
    it('should start auth flow for expired requests when refresh token fails')
    it('should expose and handle the auth flow callback')

    it('should set cookies for token and refresh token on success')
    it('should accept cookies for token and refresh token')
  })
})

function createJWTToken(keys, expiresIn, includeRefresh) {
  const options = { algorithm: 'RS256', expiresIn: expiresIn }
  const payload = { test: 'test' }
  return jwt.sign(payload, keys.privateKey, options)
}

function createKeys() {
  return new Promise((resolve, reject) => {
    var options = {
      selfSigned: true,
      days: 1
    }
    pem.createCertificate(options, function(err, keys) {
      if (err) return reject(err)

      const myKeys = {
        privateKey: keys.serviceKey,
        publicKey: keys.certificate
      }

      return resolve(myKeys)
    })
  })
}
