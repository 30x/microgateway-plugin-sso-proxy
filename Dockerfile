FROM node:4-onbuild

# Create a bare minimum configuration file for all of the parts not configurable via environment variables
RUN echo 'edgemicro:\n\
  logging:\n\
    level: warn\n\
headers:\n\
  # Retain the originally requested Host header\n\
  host: false\n\
' > /usr/src/app/config/default.yaml

EXPOSE 3000
