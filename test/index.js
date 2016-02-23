'use strict'

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
    createKeys().then(keys => {
      this.keys = keys
      target.start(keys).then(target => {
        this.target = target

        const targetPort = this.target.address().port
        if (process.env.NODE_ENV === 'test') {
          config.oauth.authorizationURL = `http://localhost:${targetPort}/oauth/authorize`
          config.oauth.tokenURL = `http://localhost:${targetPort}/oauth/token`
        }

        this.config = config
        this.config.public_key = this.keys.publicKey

        this.locationRedirect = new RegExp(this.config.oauth.authorizationURL)

        proxy
          .start(this.config, `http://localhost:${targetPort}`)
          .then(server => {
            this.server = server
          })
          .then(done)
      })
      .catch(err => {
        console.log(err.stack)
      })
    })
  })

  it('should reject invalid settings', function() {
    (() => proxy.start({})).should.throw(Error)
  })

  it('should allow no auth GET to unsecured endpoint', function(done) {
    request(this.server)
      .get('/unsecured')
      .expect(200)
      .end(done)
  })

  it('should intercept 401 response from target and start auth flow', function(done) {
    request(this.server)
      .get('/secured')
      .expect(302)
      .expect('location', this.locationRedirect)
      .expect('set-cookie', /redirect_path/)
      .end(done)
  })

  describe('api header', () => {

    it('should allow valid access token to access endpoint', function(done) {
      const token = createJWTToken(this.keys);
      request(this.server)
        .get('/unsecured')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(done)
    })

    it('should reject invalid authorization header', function(done) {
      request(this.server)
        .get('/secured')
        .set('Authorization', 'Like, whatever, man')
        .expect(400)
        .end(done)
    })

    it('should reject invalid access token', function(done) {
      request(this.server)
        .get('/secured')
        .set('Authorization', 'Bearer Like, whatever, man')
        .expect(401)
        .end(done)
    })

    it('should start auth flow for expired access token with no refresh token', function(done) {
      const token = createJWTToken(this.keys, 0)
      request(this.server)
        .get('/secured')
        .set('Authorization', `Bearer ${token}`)
        .expect(302)
        .expect('location', this.locationRedirect)
        .expect('set-cookie', /redirect_path/)
        .end(done)
    })
  })

  describe('browser cookie', () => {

    it('should allow valid access token to access endpoint', function(done) {
      const token = createJWTToken(this.keys);
      var cookieHeader = cookie.serialize('access_token', token)
      request(this.server)
        .get('/unsecured')
        .set('Cookie', cookieHeader)
        .expect(200)
        .end(done)
    })

    it('should use refresh token if access token has expired', function(done) {
      const token = createJWTToken(this.keys, 0)
      const refreshToken = createJWTToken(this.keys)
      var cookieHeader = cookie.serialize('access_token', token) + ';' + cookie.serialize('refresh_token', refreshToken)
      request(this.server)
        .get('/secured')
        .set('Cookie', cookieHeader)
        .expect(200)
        .expect('set-cookie', /access_token/)
        .expect('set-cookie', /refresh_token/)
        .end(done)
    })

    it('should start auth flow for expired access token when no refresh token', function(done) {
      const token = createJWTToken(this.keys, 0)
      var cookieHeader = cookie.serialize('access_token', token)
      request(this.server)
        .get('/secured')
        .set('Cookie', cookieHeader)
        .expect(302)
        .expect('location', this.locationRedirect)
        .expect('set-cookie', /redirect_path/)
        .end(done)
    })

    it('should start auth flow for expired access token and expired refresh token', function(done) {
      const token = createJWTToken(this.keys, 0)
      const refreshToken = createJWTToken(this.keys, 0)
      var cookieHeader = cookie.serialize('access_token', token) + ';' + cookie.serialize('refresh_token', refreshToken)
      request(this.server)
        .get('/secured')
        .set('Cookie', cookieHeader)
        .expect(302)
        .expect('location', this.locationRedirect)
        .expect('set-cookie', /redirect_path/)
        .end(done)
    })

    it('should start auth flow for expired requests when invalid refresh token', function(done) {
      const token = createJWTToken(this.keys, 0)
      var cookieHeader = cookie.serialize('access_token', token) + ';' + cookie.serialize('refresh_token', 'Nothing good')
      request(this.server)
        .get('/secured')
        .set('Cookie', cookieHeader)
        .expect(302)
        .expect('location', this.locationRedirect)
        .expect('set-cookie', /redirect_path/)
        .end(done)
    })

    it('should properly handle the oauth flow and redirect to original uri if possible', function(done) {
      request.agent(this.server)
        .get('/secured')
        .redirects(2)
        .expect(302)
        .expect('location', '/secured')
        .expect('set-cookie', /access_token/)
        .expect('set-cookie', /refresh_token/)
        .end(done)
    })

    it('should properly handle the entire auth flow', function(done) {
      request.agent(this.server)
        .get('/secured')
        .redirects(6)
        .expect(200)
        .end((err, res) => {
          res.text.should.eql('secured')
          done(err)
        })
    })
  })

  describe('bad oauth token endpoint', function() {

    before(function(done) {
      this.config.port = 0
      this.config.oauth.tokenURL = 'http://localhost/oauth/token'

      proxy
        .start(this.config, `http://localhost:${this.target.address().port}`)
        .then(server => {
          this.server = server
        })
        .then(done)
        .catch(err => {
          console.log(err.stack)
          done(err)
        })
    })

    it('will fail to get access token', function(done) {
      request(this.server)
        .get('/secured')
        .redirects(6)
        .expect(500)
        .end(done)
    })

    it('will fail to get refresh token', function(done) {
      const token = createJWTToken(this.keys, 0)
      const refreshToken = createJWTToken(this.keys, 1)
      var cookieHeader = cookie.serialize('access_token', token) + ';' + cookie.serialize('refresh_token', refreshToken)
      request(this.server)
        .get('/secured')
        .redirects(6)
        .set('Cookie', cookieHeader)
        .expect(500)
        .end(done)
    })
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
