# microgateway-plugin-sso-proxy

** THIS IS PRE-RELEASE, UNSUPPORTED SOFTWARE, AND SUBJECT TO CHANGE **

Provides transparent SSO authentication services to components behind this proxy. This is intended to run as a plugin for microgateway, but the microgateway plugin system needs a bit of enhancement before it can do that. Meanwhile, it will run standalone:

### Usage:

 * `npm install`
 * `cp config/sample.yaml config/default.yaml`
 * Edit config/default.yaml
 * `npm start`

### Configuration hints:

You may setup multiple configs and select between them by setting the NODE_ENV env var.

You may use env vars to override values in your config, see config/custom-environment-variables.yaml

e2e endpoints:

    authorizationURL: https://login.e2e.apigee.net/oauth/authorize
    tokenURL: https://login.e2e.apigee.net/oauth/token
    callbackURL: http://localhost:3000/auth/sso/callback

prod endpoints:

    authorizationURL: https://login.apigee.net/oauth/authorize
    tokenURL: https://login.apigee.net/oauth/token
    callbackURL: http://localhost:3000/auth/sso/callback
