#!/usr/bin/env node

'use strict'

const proxy = require('../test/helpers/proxy')
const config = require('config')
const superagent = require('superagent')

// make this work in Passenger even if creating a fake target
// see: https://www.phusionpassenger.com/library/indepth/nodejs/reverse_port_binding.html
if (typeof(PhusionPassenger) !== 'undefined' && !config.proxies[0].url) {
  PhusionPassenger.configure({ autoInstall: false });
  config.edgemicro.port = 'passenger'
}

getPublicKey()
  .then(publicKey => {
    config.sso.public_key = publicKey
    return getTarget()
  })
  .then(target => {
    console.log(`proxy target: ${target}`)
    config.proxies[0].url = target
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


function getTarget() {
  return new Promise((resolve, reject) => {
    if (config.proxies[0].url) return resolve(config.proxies[0].url)

    const keys = { publicKey: config.sso.public_key }
    return require('../test/helpers/target')
      .start(keys)
      .then(target => {
        console.log('started dummy target')
        resolve(`http://localhost:${target.address().port}`)
      })
      .catch(err => {
        reject(err)
      })
  })
}

function getPublicKey() {
  return new Promise((resolve, reject) => {
    if (config.sso.public_key) return resolve(config.sso.public_key)

    superagent
      .get(config.sso.public_key_url)
      .end((err, res) => {
        if (err) return reject(err)
        if (!res.body.value) return reject(`Unable to retrieve public key from: ${config.sso.public_key_url}`)
        resolve(res.body.value)
      })
  })
}
