#!/usr/bin/env node

'use strict'

const config = require('config')
const superagent = require('superagent')
const utils = require('./utils')

const PORT = 10010

utils.getPublicKey(config)
  .then(publicKey => {
    config.sso.public_key = publicKey
    // Since we always want to spin up a dummy target, delete config.proxies
    delete config.proxies
    return utils.startDummyTarget(config, PORT)
  })
  .then(target => {
    console.log(`proxy target: ${target}`)
  })
  .catch(err => {
    console.log(err instanceof Error ? err.stack : err)
    process.exit(1)
  })
