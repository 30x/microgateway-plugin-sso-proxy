'use strict'

const config = require('config')

const should = require('should')
const request = require('supertest')
const target = require('./helpers/target')
const proxy = require('./helpers/proxy')
const pem = require('pem')
const jwt = require('jsonwebtoken')
const cookie = require('cookie')
const url = require('url')
const superagent = require('superagent')

describe('oauth-proxy', () => {

  before(function(done) {

    this.config = config
    const pluginConfig = this.config.sso

    createKeys()
      .then(keys => {
        this.keys = keys
        pluginConfig.public_key = this.keys.publicKey

        target.start(keys)
          .then(target => {
            this.target = target
            const targetPort = this.target.address().port

            pluginConfig.oauth.authorizationURL = pluginConfig.oauth.authorizationURL.replace(/XXXX/, targetPort)
            pluginConfig.oauth.tokenURL = pluginConfig.oauth.tokenURL.replace(/XXXX/, targetPort)
            config.proxies[0].url = `http://localhost:${targetPort}`

            this.locationRedirect = new RegExp(pluginConfig.oauth.authorizationURL)

            proxy
              .start(this.config)
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
    const uri = '/secured'
    request(this.server)
      .get(uri)
      .expect(401)
      .expect('location', this.locationRedirect)
      .end((err, res) => {
        if (err) return done(err)

        const redirectUrl = res.headers['location']

        // check restart uri
        const parsedUrl = url.parse(redirectUrl, true)
        parsedUrl.query.state.should.eql(uri)

        var lines = res.text.split(/\r?\n/)
        lines[0].should.eql(`<head><meta http-equiv="refresh" content="0; url=${redirectUrl}"></head>`)
        lines[1].should.eql(`<a href="${redirectUrl}">${redirectUrl}</a>`)

        done()
      })
  })

  it('should start auth flow with custom restart header', function(done) {
    const uri = '/whatever'
    request(this.server)
      .get('/secured')
      .set('x-restart-url', uri)
      .expect(401)
      .expect('location', this.locationRedirect)
      .end((err, res) => {
        if (err) return done(err)

        const redirectUrl = res.headers['location']

        // check restart uri
        const parsedUrl = url.parse(redirectUrl, true)
        parsedUrl.query.state.should.eql(uri)

        var lines = res.text.split(/\r?\n/)
        lines[0].should.eql(`<head><meta http-equiv="refresh" content="0; url=${redirectUrl}"></head>`)
        lines[1].should.eql(`<a href="${redirectUrl}">${redirectUrl}</a>`)

        done()
      })
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
        .expect(401)
        .expect('location', this.locationRedirect)
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
        .expect(401)
        .expect('location', this.locationRedirect)
        .end(done)
    })

    it('should start auth flow for expired access token and expired refresh token', function(done) {
      const token = createJWTToken(this.keys, 0)
      const refreshToken = createJWTToken(this.keys, 0)
      var cookieHeader = cookie.serialize('access_token', token) + ';' + cookie.serialize('refresh_token', refreshToken)
      request(this.server)
        .get('/secured')
        .set('Cookie', cookieHeader)
        .expect(401)
        .expect('location', this.locationRedirect)
        .end(done)
    })

    it('should start auth flow for expired requests when invalid refresh token', function(done) {
      const token = createJWTToken(this.keys, 0)
      var cookieHeader = cookie.serialize('access_token', token) + ';' + cookie.serialize('refresh_token', 'Nothing good')
      request(this.server)
        .get('/secured')
        .set('Cookie', cookieHeader)
        .expect(401)
        .expect('location', this.locationRedirect)
        .end(done)
    })

    it('should properly handle the oauth flow and set redirect to original uri', function(done) {
      request(this.server)
        .get('/secured')
        .expect(401)
        .expect('location', this.locationRedirect)
        .end((err, res) => {
          if (err) return done(err)

          superagent.agent()
            .get(res.headers['location'])
            .redirects(1)
            .end((err, res) => {
              res.statusCode.should.eql(302)
              res.headers['set-cookie'].should.matchAny(/access_token/)
              res.headers['set-cookie'].should.matchAny(/refresh_token/)
              done()
            })
        })
    })

    it('should properly handle the entire auth flow', function(done) {
      request(this.server)
        .get('/secured')
        .expect(401)
        .expect('location', this.locationRedirect)
        .end((err, res) => {
          if (err) return done(err)

          superagent.agent()
            .get(res.headers['location'])
            .redirects(2)
            .end((err, res) => {
              res.statusCode.should.eql(200)
              res.text.should.eql('secured')
              done()
            })
        })
    })

    it('should properly handle the oauth flow with redirect to custom url', function(done) {
      request(this.server)
        .get('/secured')
        .set('x-restart-url', '/unsecured')
        .expect(401)
        .expect('location', this.locationRedirect)
        .end((err, res) => {
          if (err) return done(err)

          superagent.agent()
            .get(res.headers['location'])
            .redirects(2)
            .end((err, res) => {
              res.statusCode.should.eql(200)
              res.text.should.eql('unsecured')
              done()
            })
        })
    })
  })

  describe('bad oauth token endpoint', function() {

    before(function(done) {
      this.config.sso.oauth.tokenURL = 'http://localhost/bad/oauth/endpoint'

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
        .expect(401)
        .expect('location', this.locationRedirect)
        .end((err, res) => {
          if (err) return done(err)

          superagent.agent()
            .get(res.headers['location'])
            .redirects(1)
            .end((err, res) => {
              res.statusCode.should.eql(500)
              res.body.error_description.message.should.eql('Failed to obtain access token')
              done()
            })
        })
    })

    it('will fail to get refresh token', function(done) {
      const token = createJWTToken(this.keys, 0)
      const refreshToken = createJWTToken(this.keys, 1)
      var cookieHeader = cookie.serialize('access_token', token) + ';' + cookie.serialize('refresh_token', refreshToken)
      request(this.server)
        .get('/secured')
        .set('Cookie', cookieHeader)
        .expect(401)
        .expect('location', this.locationRedirect)
        .end((err, res) => {
          if (err) return done(err)

          superagent.agent()
            .get(res.headers['location'])
            .redirects(1)
            .end((err, res) => {
              res.statusCode.should.eql(500)
              res.body.error_description.message.should.eql('Failed to obtain access token')
              done()
            })
        })
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
