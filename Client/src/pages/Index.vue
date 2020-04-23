<template>
  <q-page class="flex flex-center">
    <VideoContainer @share-screen="enableShare" />
  </q-page>
</template>

<script >
import protooClient from "protoo-client";
import * as mediasoupClient from "mediasoup-client";
import VideoContainer from "../components/VideoContainer";

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
  components: {
    VideoContainer
  },
  data() {
    return {
      consume: true,
      producers: [],
      shareProducer: null,
      sendTransport: null
    };
  },
  created() {
    const protooTransport = new protooClient.WebSocketTransport(
      "wss://localhost:8080/socket"
    );

    this.peer = new protooClient.Peer(protooTransport);

    this.peer.on("open", this.joinRoom);

    this.peer.on("request", this.handleRequest);

    this.peer.on("failed", () => {
      console.error("WebSocket connection failed");
    });
  },
  methods: {
    async enableShare() {
      if (!this.mediasoupDevice.canProduce("video")) {
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
          displaySurface: "monitor",
          logicalSurface: true,
          cursor: true,
          width: { max: 1920 },
          height: { max: 1080 },
          frameRate: { max: 30 }
        }
      });

      let track = stream.getVideoTracks()[0];

      this.shareProducer = await this.sendTransport.produce({ track });

      this.producers.push({
        id: this.shareProducer.id,
        type: "share",
        paused: this.shareProducer.paused,
        track: this.shareProducer.track,
        rtpParameters: this.shareProducer.rtpParameters,
        codec: this.shareProducer.rtpParameters.codecs[0].mimeType.split("/")[1]
      });

      this.shareProducer.on("transportclose", () => {
        this.shareProducer = null;
      });

      this.shareProducer.on("trackended", () => {
        this.disableShare().catch(() => {});
      });
    },
    async disableShare() {},
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

      const transportInfo = await this.peer.request("createWebRtcTransport", {
        forceTcp: false,
        producing: true,
        consuming: false,
        sctpCapabilities: false
          ? this._mediasoupDevice.sctpCapabilities
          : undefined
      });

      const {
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters,
        sctpParameters
      } = transportInfo;

      this.sendTransport = this.mediasoupDevice.createSendTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters,
        sctpParameters,
        iceServers: [],
        proprietaryConstraints: PC_PROPRIETARY_CONSTRAINTS
      });

      this.sendTransport.on(
        "connect",
        (
          { dtlsParameters },
          callback,
          errback // eslint-disable-line no-shadow
        ) => {
          this.peer
            .request("connectWebRtcTransport", {
              transportId: this.sendTransport.id,
              dtlsParameters
            })
            .then(callback)
            .catch(errback);
        }
      );

      this.sendTransport.on(
        "produce",
        async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            // eslint-disable-next-line no-shadow
            const { id } = await this.peer.request("produce", {
              transportId: this.sendTransport.id,
              kind,
              rtpParameters,
              appData
            });

            callback({ id });
          } catch (error) {
            errback(error);
          }
        }
      );

      this.sendTransport.on(
        "producedata",
        async (
          { sctpStreamParameters, label, protocol, appData },
          callback,
          errback
        ) => {
          try {
            // eslint-disable-next-line no-shadow
            const { id } = await this.peer.request("produceData", {
              transportId: this._sendTransport.id,
              sctpStreamParameters,
              label,
              protocol,
              appData
            });

            callback({ id });
          } catch (error) {
            errback(error);
          }
        }
      );
    }
  }
};
</script>
