<template>
  <div id="q-app">
    <router-view />
  </div>
</template>

<script >
import protooClient from "protoo-client";
import * as mediasoupClient from "mediasoup-client";

const VIDEO_CONSTRAINS = {
  qvga: { width: { ideal: 320 }, height: { ideal: 240 } },
  vga: { width: { ideal: 640 }, height: { ideal: 480 } },
  hd: { width: { ideal: 1280 }, height: { ideal: 720 } }
};

const PC_PROPRIETARY_CONSTRAINTS = {
  optional: [{ googDscp: true }]
};

const VIDEO_SIMULCAST_ENCODINGS = [
  { maxBitrate: 180000, scaleResolutionDownBy: 4 },
  { maxBitrate: 360000, scaleResolutionDownBy: 2 },
  { maxBitrate: 1500000, scaleResolutionDownBy: 1 }
];

// Used for VP9 webcam video.
const VIDEO_KSVC_ENCODINGS = [{ scalabilityMode: "S3T3_KEY" }];

// Used for VP9 desktop sharing.
const VIDEO_SVC_ENCODINGS = [{ scalabilityMode: "S3T3", dtx: true }];

export default {
  name: "App",
  data(){
    return {
      consume: true
    }
  },
  created() {
    const protooTransport = new protooClient.WebSocketTransport(
      "ws://localhost:8080/socket"
    );

    this.peer = new protooClient.Peer(protooTransport);

    this.peer.on("open", this.joinRoom);

    this.peer.on("request", this.handleRequest);

    this.peer.on("failed", () => {
      console.error("WebSocket connection failed");
    });
  },
  methods: {
    async handleRequest() {
      switch (request.method) {
        case "newConsumer":
          {
            if (!this.consume) {
              reject(403, "I do not want to consume");

              break;
            }

            const {
              peerId,
              producerId,
              id,
              kind,
              rtpParameters,
              type,
              appData,
              producerPaused
            } = request.data;

            let codecOptions;

            if (kind === "audio") {
              codecOptions = {
                opusStereo: 1
              };
            }

            try {
              const consumer = await this._recvTransport.consume({
                id,
                producerId,
                kind,
                rtpParameters,
                codecOptions,
                appData: { ...appData, peerId } // Trick.
              });

              // Store in the map.
              this._consumers.set(consumer.id, consumer);

              consumer.on("transportclose", () => {
                this._consumers.delete(consumer.id);
              });

              const {
                spatialLayers,
                temporalLayers
              } = mediasoupClient.parseScalabilityMode(
                consumer.rtpParameters.encodings[0].scalabilityMode
              );

              store.dispatch(
                stateActions.addConsumer(
                  {
                    id: consumer.id,
                    type: type,
                    locallyPaused: false,
                    remotelyPaused: producerPaused,
                    rtpParameters: consumer.rtpParameters,
                    spatialLayers: spatialLayers,
                    temporalLayers: temporalLayers,
                    preferredSpatialLayer: spatialLayers - 1,
                    preferredTemporalLayer: temporalLayers - 1,
                    priority: 1,
                    codec: consumer.rtpParameters.codecs[0].mimeType.split(
                      "/"
                    )[1],
                    track: consumer.track
                  },
                  peerId
                )
              );

              // We are ready. Answer the protoo request so the server will
              // resume this Consumer (which was paused for now if video).
              accept();

              // If audio-only mode is enabled, pause it.
              if (consumer.kind === "video" && store.getState().me.audioOnly)
                this._pauseConsumer(consumer);
            } catch (error) {
              logger.error('"newConsumer" request failed:%o', error);

              store.dispatch(
                requestActions.notify({
                  type: "error",
                  text: `Error creating a Consumer: ${error}`
                })
              );

              throw error;
            }
          }

          break;
      }
    },
    async joinRoom() {
      this.mediasoupDevice = new mediasoupClient.Device({
        handlerName: undefined
      });

      const routerRtpCapabilities = await this.peer.request(
        "getRouterRtpCapabilities"
      );

      await this.mediasoupDevice.load({ routerRtpCapabilities });
    }
  }
};
</script>
