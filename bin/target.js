#!/usr/bin/env node

'use strict'

const proxy = require('../test/helpers/proxy')
const config = require('config')
const superagent = require('superagent')

const PORT = 10010

getPublicKey()
  .then(publicKey => {
    config.sso.public_key = publicKey
    return getTarget()
  })
  .then(target => {
    console.log(`proxy target: ${target}`)
  })
  .catch(err => {
    console.log(err instanceof Error ? err.stack : err)
    process.exit(1)
  })


function getTarget() {
  return new Promise((resolve, reject) => {

    const keys = { publicKey: config.sso.public_key }
    return require('../test/helpers/target')
      .start(keys, PORT)
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
    superagent
      .get(config.sso.public_key_url)
      .end((err, res) => {
        if (err) return reject(err)
        if (!res.body.value) return reject(`Unable to retrieve public key from: ${config.sso.public_key_url}`)
        resolve(res.body.value)
      })
  })
}
