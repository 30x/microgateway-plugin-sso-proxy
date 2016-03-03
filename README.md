# microgateway-plugin-sso-proxy

** THIS IS PRE-RELEASE, UNSUPPORTED SOFTWARE, AND SUBJECT TO CHANGE **

[![Build Status](https://travis-ci.org/30x/microgateway-plugin-sso-proxy.svg?branch=master)](https://travis-ci.org/30x/microgateway-plugin-sso-proxy)

[![Coverage Status](https://coveralls.io/repos/github/30x/microgateway-plugin-sso-proxy/badge.svg?branch=master)](https://coveralls.io/github/30x/microgateway-plugin-sso-proxy?branch=master)

Provides transparent SSO authentication services to components behind this proxy. This can run as a plugin for Edge Microgateway or can be run standalone. (Note: Requires access to Edge Microgateway either way.)

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

### Protocol

1. Proxy will validate JWT included as authorization header bearer token or access_token cookie.
2. Proxy will automatically refresh an expired or missing access_token cookie with refresh_token cookie if present.
3. Proxy will intercept 401 from target and start OAuth 2.0 authorization flow using a 401 and meta tag redirect (url will also be in location header)
4. Proxy will redirect to original url (or value of x-restart-url header) after auth flow if GET request. This value will be passed in the state query var during the OAuth flow.
5. Proxy will only ever pass a valid JWT access token in the Authorization header as a Bearer token to the target.

For the entire flow, please see this diagram:

[Sequence Diagram](http://knsv.github.io/mermaid/live_editor/#/edit/c2VxdWVuY2VEaWFncmFtCnBhcnRpY2lwYW50IEJyb3dzZXIKcGFydGljaXBhbnQgUHJveHkKcGFydGljaXBhbnQgU2VydmljZQpwYXJ0aWNpcGFudCBTU08KTm90ZSBsZWZ0IG9mIEJyb3dzZXI6IFN0YXJ0IHJlcXVlc3QuLi4KQnJvd3Nlci0-PlByb3h5OiByZXEKTm90ZSBsZWZ0IG9mIFByb3h5OiBtYXkgaW5jbHVkZSAieC1yZXN0YXJ0LXVybCIgaGVhZGVyClByb3h5LT4-UHJveHk6IGNoZWNrIGF1dGhvcml6YXRpb24gaGVhZGVyIChCZWFyZXIpIG9yIGFjY2Vzc190b2tlbiBjb29raWUgZm9yIEpXVApQcm94eS0tPj5TU086IGlmIGV4cGlyZWQsIHJlZnJlc2ggdXNpbmcgcmVmcmVzaF90b2tlbiBjb29raWUKUHJveHktPj5TZXJ2aWNlOiByZXEgdy8gQXV0aG9yaXphdGlvbiBoZWFkZXIgQmVhcmVyIHRva2VuClNlcnZpY2UtLT4-QnJvd3NlcjogaWYgbm8gYXV0aCBuZWVkZWQsIGp1c3QgY29udGludWUKU2VydmljZS0-PlNlcnZpY2U6IGNoZWNrIEF1dGhvcml6YXRpb24gaGVhZGVyIEJlYXJlciB0b2tlbgpTZXJ2aWNlLT4-UHJveHk6IDQwMSBpZiBhdXRoIG1pc3NpbmcgYW5kIG5lZWRlZApQcm94eS0-PkJyb3dzZXI6IDQwMSArIG1ldGEgcmVkaXJlY3QgdG8gc3RhcnQgYXV0aCBmbG93Ck5vdGUgbGVmdCBvZiBQcm94eTogZmxvdyBzdGFydCB1cmwgaW4gbG9jYXRpb24gaGVhZGVyLCByZXN0YXJ0IHVybCBpbiBzdGF0ZSBxdWVyeSB2YXIgKG9ubHkgZm9yIEdFVCByZXFzKQoKTm90ZSBsZWZ0IG9mIEJyb3dzZXI6IFN0YW5kYXJkIE9BdXRoIDIuMCBhdXRoIGNvZGUgZmxvdy4uLgpCcm93c2VyLT4-U1NPOiBHZXQgbG9naW4gZm9ybQpTU08tPj5Ccm93c2VyOiBMb2dpbiBmb3JtCkJyb3dzZXItPj5TU086IFBvc3QgbG9naW4gKG9yIHRvIGFub3RoZXIgT0F1dGggbG9naW4gcHJvdmlkZXIpClNTTy0-PkJyb3dzZXI6IDMwMiArIGF1dGggY29kZQpCcm93c2VyLT4-UHJveHk6IGF1dGggY29kZSB0byBvYXV0aCBjYWxsYmFjawpQcm94eS0-PlNTTzogVmVyaWZ5IGF1dGggY29kZQpTU08tPj5Qcm94eTogYWNjZXNzIGFuZCByZWZyZXNoIEpXVHMKCk5vdGUgbGVmdCBvZiBCcm93c2VyOiBGaW5pc2ggcmVxdWVzdC4uLgpQcm94eS0tPj5Ccm93c2VyOiBJZiBubyByZXN0YXJ0IHVybCwgMjAwIHcvICJhdXRoZW50aWNhdGVkIiBpbiBib2R5ClByb3h5LT4-QnJvd3NlcjogSWYgcmVzdGFydCB1cmwsIDMwMiB0byByZXN0YXJ0IHVybApOb3RlIHJpZ2h0IG9mIEJyb3dzZXI6IHNldHMgYWNjZXNzX3Rva2VuICYgcmVmcmVzaF90b2tlbiBjb29raWVzCkJyb3dzZXItPj5Qcm94eTogcmVxIHcvIGFjY2Vzc190b2tlbiBKV1QgY29va2llClByb3h5LT4-UHJveHk6IHZlcmlmeSBhY2Nlc3NfdG9rZW4gY29va2llIEpXVApQcm94eS0-PlNlcnZpY2U6IHJlcSB3LyBBdXRob3JpemF0aW9uIGhlYWRlciBCZWFyZXIgdG9rZW4KU2VydmljZS0-PlNlcnZpY2U6IGNoZWNrIEF1dGhvcml6YXRpb24gaGVhZGVyIEJlYXJlciB0b2tlbgpTZXJ2aWNlLT4-QnJvd3NlcjogcmVzcG9uc2U)

diagram source:

    sequenceDiagram
    participant Browser
    participant Proxy
    participant Service
    participant SSO
    Note left of Browser: Start request...
    Browser->>Proxy: req
    Note left of Proxy: may include "x-restart-url" header
    Proxy->>Proxy: check authorization header (Bearer) or access_token cookie for JWT
    Proxy-->>SSO: if expired, refresh using refresh_token cookie
    Proxy->>Service: req w/ Authorization header Bearer token
    Service-->>Browser: if no auth needed, just continue
    Service->>Proxy: 401 if auth missing and needed
    Proxy->>Browser: 401 + meta redirect to start auth flow
    Note left of Proxy: flow start url in location header, restart url in state query var (only for GET reqs)

    Note left of Browser: Standard OAuth 2.0 auth code flow...
    Browser->>SSO: Get login form
    SSO->>Browser: Login form
    Browser->>SSO: Post login (or to another OAuth login provider)
    SSO->>Browser: 302 + auth code
    Browser->>Proxy: auth code to oauth callback
    Proxy->>SSO: Verify auth code
    SSO->>Proxy: access and refresh JWTs

    Note left of Browser: Finish request...
    Proxy-->>Browser: If no restart url, 200 w/ "authenticated" in body
    Proxy->>Browser: If restart url, 302 to restart url
    Note right of Browser: sets access_token & refresh_token cookies
    Browser->>Proxy: req w/ access_token JWT cookie
    Proxy->>Proxy: Verify JWT
    Proxy->>Service: req w/ Authorization header Bearer token
    Service->>Service: check Authorization header Bearer token
    Service->>Browser: response
