'use strict'

const util = require('util')
const OAuth2Strategy = require('passport-oauth').OAuth2Strategy
const debug = require('debug')('plugin:sso-proxy')

class ApigeeSSOStrategy extends OAuth2Strategy {

  constructor(options, verify) {
    options = options || {};
    options.authorizationURL = options.authorizationURL || 'https://login.apigee.com/oauth/authorize';
    options.tokenURL = options.tokenURL || 'https://login.apigee.com/oauth/token';
    options.customHeaders = {
      'Authorization': 'Basic ' + new Buffer(options.clientID + ':' + options.clientSecret).toString('base64')
    }
    options.skipUserProfile = true

    super(options, verify)
    this.name = 'ApigeeSSO'
  }
}

module.exports = ApigeeSSOStrategy
