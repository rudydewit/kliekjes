# Het basisimage staat hier hard: de Supervisor geeft anders zijn eigen
# BUILD_FROM mee en dan mist Node in de container.
FROM node:24-alpine

LABEL io.hass.name="Kliekjes" \
      io.hass.description="Bijhouden wat er in de vriezer ligt, met foto's" \
      io.hass.type="addon" \
      io.hass.version="1.0.8"

WORKDIR /app
COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

# Geen npm install: de server draait op Node's ingebouwde http- en sqlite-modules.
CMD ["node", "server/server.js"]
