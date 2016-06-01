#!/usr/bin/env node

'use strict'

const proxy = require('../test/helpers/proxy')
const config = require('config')
const superagent = require('superagent')
const utils = require('./utils')

// make this work in Passenger even if creating a fake target
// see: https://www.phusionpassenger.com/library/indepth/nodejs/reverse_port_binding.html
if (typeof(PhusionPassenger) !== 'undefined' && !config.proxies[0].url) {
  PhusionPassenger.configure({ autoInstall: false });
  config.edgemicro.port = 'passenger'
}

utils.getPublicKey(config)
  .then(publicKey => {
    config.sso.public_key = publicKey
    return getTarget(config)
  })
  .then(target => {
    console.log(`proxy target: ${target}`)
    // If there isn't already a proxy configured, configure one with a default base_path of /.  Otherwise, update the
    // first proxy with the provided target.
    if (!config.proxies[0]) {
      config.proxies[0] = {
        base_path: '/',
        url: target
      }
    } else {
      config.proxies[0].url = target
    }
    return proxy.start(config, target)
  })
  .then(server => {
    this.server = server
    console.log(`proxy port ${server.address().port}`)
  })
  .catch(err => {
    console.log(err instanceof Error ? err.stack : err)
    process.exit(1)
  })

function getTarget (config) {
  // Ensure that config.proxies is set to something to avoid validating it below
  if (!config.proxies) {
    config.proxies = []
  }

  return new Promise((resolve, reject) => {
    // Either use a pre-provided proxy, get the proxy details from the SSO_PROXY_TARGET environment variable or use the
    // dummy target. (In the case of bin/target.js, we will always use the dummy target.)
    if (config.proxies[0] && config.proxies[0].url) {
      resolve(config.proxies[0].url)
    } else if (process.env.SSO_PROXY_TARGET) {
      const proxyParts = process.env.SSO_PROXY_TARGET.split('->')

      if (proxyParts.length !== 2) {
        reject('Invalid SSO_PROXY_TARGET value.  Expected format: {BASE_PATH}->{URL}')
      } else {
        // Prepend the proxy to ensure that it gets used
        config.proxies.unshift({
          base_path: proxyParts[0].trim(),
          url: proxyParts[1].trim()
        })
        resolve(config.proxies[0].url)
      }
    } else {
      utils.startDummyTarget(config)
        .then(resolve, reject)
    }
  })
}
