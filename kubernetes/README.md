# Deploying the SSO Proxy to Kubernetes

There really is not anything special in how we deploy the SSO Proxy to Kubernetes.  But since there is a little setup
it makes sense to document the whole process for those wanting to do this in the future.

**Note:** The examples below and the Docker image deployed to the Official Docker repository are running the SSO Proxy
as a standalone application.  Chances are good you will actually be running the SSO Proxy as a
[Microgateway][microgateway] plugin in which case you will need to package things up a little differently.  Exactly how
this will be done is unknown right now and as soon as that information is available, we will update this page
accordingly.

## Building the SSO Proxy Docker Image

How and where you push your Docker images dictates how much of this documentation is reusable.  Let's pretend we are
building the official Docker image for this container _(Located here: <https://hub.docker.com/r/thirtyx/sso-proxy/>)_.

### Build the Docker Image

While in the source root for the SSO Proxy, run the following:

`docker build -t sso-proxy .`

### Tagging the Docker Image

`docker tag -f sso-proxy thirtyx/sso-proxy:latest`

### Push the Docker Image

`docker push thirtyx/sso-proxy`

## Deploying the SSO Proxy to Kubernetes

Exactly how you deploy the SSO Proxy to Kubernetes will depend on your needs.  For simplicity, we will be using a
Kubernetes [Deployment][k8s-deployments] descriptor that will deploy the SSO Proxy container and configure it.
For ingress functionality, we will be using the [k8s-pods-ingress][].  _(There will be comments where this matters.)_
Below is an example complete with documentation on each of the important pieces.

### Optional Secret(s)

To avoid copying/pasting sensitive information and stuffing that into a Kubernetes discriptor file, you can use
Kubernetes [secrets][k8s-secrets] to store this data.  The example below assumes you will use this suggested
practice so with that being said, we need to create a Kubernets Secret using:
`kubectl create secret generic sso --from-literal=client-secret=INSERT_REAL_SSO_CLIENT_APPLICATION_SECRET`

### Example Kubernetes Deployment Discriptor

``` yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: sso-proxy
spec:
  replicas: 1
  template:
    metadata:
      labels:
        name: sso-proxy
        # Make the Pod(s) routable
        routable: "true"
      annotations:
        # Wire up this Pod to service requests for sso.k8s.local
        routingHosts: "sso.k8s.local"
        # Wire up this Pod to service all traffic for sso.k8s.local via the container listening on port 3000
        routingPaths: "3000:/"
    spec:
      containers:
        - name: sso-proxy
          image: thirtyx/sso-proxy:latest
          ports:
            - containerPort: 3000
          env:
            # Configure the SSO Proxy using environment variables (https://github.com/30x/microgateway-plugin-sso-proxy/blob/master/config/custom-environment-variables.yaml)
            #
            # The port that the sso-proxy will bind to within the container
            - name: SSO_PORT
              value: "3000"
            # The SSO client application's id
            - name: SSO_CLIENT_ID
            # The URL to get the public key (If you already have a public key value, you can omit this environment variable and use the SSO_PUBLIC_KEY one instead)
            - name: SSO_PUBLIC_KEY_URL
              value: https://login.apigee.com/token_key
            # The public key
            # - name: SSO_PUBLIC_KEY
            #   value: INSERT_PUBLIC_KEY
            # The SSO client application secret (You could also throw in the raw SSO client application secret using the `value` property but it's not advised.)
            - name: SSO_CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  # The Kubernetes Secret name
                  name: sso
                  # The Kubernetes Secret key name
                  key: client-secret
              # Example of how to provide the value directly in case you did not use a Kubernetes Secret to store this value
              # value: INSERT_REAL_SSO_CLIENT_APPLICATION_SECRET
            # The SSO client application's authorization URL
            - name: SSO_AUTH_URL
              value: https://login.apigee.com/oauth/authorize
            # The SSO client application's token URL
            - name: SSO_TOKEN_URL
              value: https://login.apigee.com/oauth/token
            # The SSO client application's callback URL
            - name: SSO_CALLBACK_URL
              value: http://sso.k8s.local/auth/sso/callback
```

### Create the Kubernetes Deployment

Once you've got your Kubernetes descriptor, use `kubectl create -f YOUR_FILE` and it should deploy the SSO Proxy to
Kubernetes based on your Kubernetes descriptor.

[microgateway]: https://github.com/apigee/microgateway
[k8s-deployments]: http://kubernetes.io/docs/user-guide/deployments/
[k8s-pods-ingress]: https://github.com/30x/k8s-pods-ingress
[sso-proxy]: https://github.com/30x/microgateway-plugin-sso-proxy
