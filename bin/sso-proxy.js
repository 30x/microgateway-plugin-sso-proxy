#!/usr/bin/env node

'use strict'

const proxy = require('../test/helpers/proxy')
const config = require('config')

getTarget()
  .then(target => {
    console.log(`proxy target: ${target}`)
    proxy
      .start(config, target)
      .then(server => {
        this.server = server
        console.log(`proxy port ${config.port}`)
      })
  })
  .catch(err => {
    console.log(err.stack)
    process.exit(1)
  })


function getTarget() {
  return new Promise((resolve, reject) => {
    if (config.target) return resolve(config.target)

    return require('../test/helpers/target')
      .start()
      .then(target => {
        console.log('started dummy target')
        resolve(`http://localhost:${target.address().port}`)
      })
      .catch(err => {
        reject(err)
      })
  })
}
