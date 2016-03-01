'use strict'

const connect = require('connect')
const http = require('http')
const debug = require('debug')('test:proxy')
const edgemicro = require('edgemicro')

module.exports.start = (gatewayConfig) => {

  const gateway = edgemicro(gatewayConfig)

  return new Promise((resolve, reject) => {
    debug('starting gateway')

    gateway.start((err, server) => {
      debug('gateway err %o', err)
      if (err) return reject(err)

      gatewayConfig.sso.oauth.callbackURL = gatewayConfig.sso.oauth.callbackURL.replace(/XXXX/, server.address().port)
      //gatewayConfig.sso.oauth.callbackURL = `http://localhost:${server.address().port}/auth/sso/callback`

      const plugin = require('../../lib')
      gateway.addPlugin('sso', plugin)

      debug('gateway started')
      return resolve(server)
    })
  })
}
