'use strict'

const superagent = require('superagent')
const target = require('../test/helpers/target')

module.exports.getPublicKey = (config) => {
  return new Promise((resolve, reject) => {
    if (config.sso.public_key) {
      resolve(config.sso.public_key)
    } else {
      superagent
        .get(config.sso.public_key_url)
        .end((err, res) => {
          if (err) {
            reject(err)
          } else if (!res.body.value) {
            reject(`Unable to retrieve public key from: ${config.sso.public_key_url}`)
          } else {
            resolve(res.body.value)
          }
        })
    }
  })
}

module.exports.startDummyTarget = (config, dummyPort) => {
  return new Promise((resolve, reject) => {
    target.start({
      publicKey: config.sso.public_key
    }, dummyPort)
      .then(target => {
        console.log('started dummy target')
        resolve(`http://localhost:${target.address().port}`)
      })
      .catch(err => {
        reject(err)
      })
  })
}
