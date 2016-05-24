FROM node:4-onbuild

# Create a bare minimum configuration file for all of the parts not configurable via environment variables
RUN echo 'edgemicro:\n\
  logging:\n\
    level: warn\n\
proxies:\n\
- base_path: /\n\
  # put a target URL here (or leave blank for dummy target server)\n\
  url:\n\
' > /usr/src/app/config/default.yaml

EXPOSE 3000
