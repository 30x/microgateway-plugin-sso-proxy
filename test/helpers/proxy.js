'use strict'

const connect = require('connect')
const http = require('http')
const debug = require('debug')('test:proxy')
const microgateway = require('microgateway-core')

module.exports.start = (gatewayConfig) => {

  const gateway = microgateway(gatewayConfig)

  return new Promise((resolve, reject) => {
    debug('starting gateway')

    gateway.start((err, server) => {
      debug('gateway err %o', err)
      if (err) return reject(err)

      gatewayConfig.sso.oauth.callbackURL = gatewayConfig.sso.oauth.callbackURL.replace(/XXXX/, server.address().port)

      const plugin = require('../../lib')
      gateway.addPlugin('sso', plugin)

      debug('gateway started')
      return resolve(server)
    })
  })
}
