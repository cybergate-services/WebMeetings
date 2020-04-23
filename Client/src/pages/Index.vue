<template>
  <q-page class="flex flex-center">
    <VideoContainer
      @enableShare="enableShare"
      @disableShare="disableShare"
      :sharingScreen="shareProducer != null"
    />
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
      produce: true,
      useDataChannel: false,
      videoStream: null,
      connected: false,
      displayName: "Diego",
      producers: {},
      consumers: {},
      peers: {},
      activeSpeakerId: null,
      shareProducer: null,
      webcamProducer: null,
      sendTransport: null,
      micProducer: null
    };
  },
  created() {
    const protooTransport = new protooClient.WebSocketTransport(
      "wss://localhost:8080/socket"
    );

    this.peer = new protooClient.Peer(protooTransport);

    this.peer.on("open", this.joinRoom);

    this.peer.on("request", this.handleRequest);

    this.peer.on("notification", this.handleNotification);

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

      /*

      const videoStream = new MediaStream();

      videoStream.addTrack(track);

      this.videoStream = videoStream;

      */

      this.shareProducer.on("transportclose", () => {
        this.shareProducer = null;
      });

      this.shareProducer.on("trackended", () => {
        this.disableShare().catch(() => {});
      });
    },
    async disableShare() {
      this.shareProducer.close();

      try {
        await this.peer.request("closeProducer", {
          producerId: this.shareProducer.id
        });
      } catch (error) {
        this.$q.notify({
          type: "error",
          message: `Error closing server-side share Producer: ${error}`
        });
      }

      this.shareProducer = null;
    },
    async handleRequest(request) {
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
              const consumer = await this.recvTransport.consume({
                id,
                producerId,
                kind,
                rtpParameters,
                codecOptions,
                appData: { ...appData, peerId } // Trick.
              });

              // Store in the map.

              this.$set(this.consumers, consumer.id, consumer);

              consumer.on("transportclose", () => {
                this.consumers.delete(consumer.id);
              });

              const {
                spatialLayers,
                temporalLayers
              } = mediasoupClient.parseScalabilityMode(
                consumer.rtpParameters.encodings[0].scalabilityMode
              );

              this.$set(this.consumers, peerId, {
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
                codec: consumer.rtpParameters.codecs[0].mimeType.split("/")[1],
                track: consumer.track
              });

              // We are ready. Answer the protoo request so the server will
              // resume this Consumer (which was paused for now if video).
              accept();

              // If audio-only mode is enabled, pause it.
              if (consumer.kind === "video" && store.getState().me.audioOnly)
                this.pauseConsumer(consumer);
            } catch (error) {
              logger.error('"newConsumer" request failed:%o', error);

              this.$q.notify({
                type: "error",
                message: `Error creating a Consumer: ${error}`
              });

              throw error;
            }
          }
          break;
      }
    },
    async handleNotification(notification) {
      console.debug(
        'proto "notification" event [method:%s, data:%o]',
        notification.method,
        notification.data
      );

      switch (notification.method) {
        case "producerScore": {
          const { producerId, score } = notification.data;

          const producer = this.producers[producerId];

          producer.score = score;
          break;
        }

        case "newPeer": {
          const peer = notification.data;

          this.$set(this.peers, peer.id, {
            ...peer,
            consumers: [],
            dataConsumers: []
          });

          this.$q.notify({
            color: "info",
            message: `${peer.displayName} has joined the room`
          });

          break;
        }

        case "peerClosed": {
          const { peerId } = notification.data;

          this.$delete(this.peers, peerId);

          break;
        }

        case "peerDisplayNameChanged": {
          const { peerId, displayName, oldDisplayName } = notification.data;

          const peer = this.peers[peerId];

          peer.displayName = displayName;

          this.$q.notify({
            message: `${oldDisplayName} is now ${displayName}`,
            color: "info"
          });

          break;
        }

        case "consumerClosed": {
          const { consumerId } = notification.data;
          const consumer = this.consumers[consumerId];

          if (!consumer) break;

          consumer.close();

          this.$delete(this.consumers, consumerId);

          const { peerId } = consumer.appData;

          function removeConsumer(consumerId, peerId) {
            const peer = state[peerId];

            // NOTE: This means that the Peer was closed before, so it's ok.
            if (!peer) return state;

            const idx = peer.consumers.indexOf(consumerId);

            if (idx === -1) throw new Error("Consumer not found");

            peer.consumers.splice(idx, 1);
          }

          removeConsumer(consumerId, peerId);

          break;
        }

        case "consumerPaused": {
          const { consumerId } = notification.data;
          const consumer = this.consumers[consumerId];

          if (!consumer) break;

          store.dispatch(stateActions.setConsumerPaused(consumerId, "remote"));

          break;
        }

        case "consumerResumed": {
          const { consumerId } = notification.data;
          const consumer = this.consumers[consumerId];

          if (!consumer) break;

          consumer.remotelyPaused = true;

          break;
        }

        case "consumerLayersChanged": {
          const { consumerId, spatialLayer, temporalLayer } = notification.data;
          const consumer = this.consumers[consumerId];

          if (!consumer) break;

          consumer.currentSpatialLayer = spatialLayer;
          consumer.currentTemporalLayer = temporalLayer;

          break;
        }

        case "consumerScore": {
          const { consumerId, score } = notification.data;

          const consumer = this.consumers[consumerId];

          if (!consumer) break;

          consumer.score = score;

          break;
        }

        case "activeSpeaker": {
          const { peerId } = notification.data;

          this.activeSpeakerId = peerId;

          break;
        }

        default: {
          console.error(
            'unknown protoo notification.method "%s"',
            notification.method
          );
        }
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

      if (this.produce) {
        const transportInfo = await this.peer.request("createWebRtcTransport", {
          producing: true,
          consuming: false,
          sctpCapabilities: this.useDataChannel
            ? this.mediasoupDevice.sctpCapabilities
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

      if (this.consume) {
        const transportInfo = await this.peer.request("createWebRtcTransport", {
          forceTcp: false,
          producing: false,
          consuming: true,
          sctpCapabilities: this.useDataChannel
            ? this.mediasoupDevice.sctpCapabilities
            : undefined
        });

        const {
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters
        } = transportInfo;

        this.recvTransport = this.mediasoupDevice.createRecvTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters,
          iceServers: []
        });

        this.recvTransport.on(
          "connect",
          (
            { dtlsParameters },
            callback,
            errback // eslint-disable-line no-shadow
          ) => {
            this.peer
              .request("connectWebRtcTransport", {
                transportId: this.recvTransport.id,
                dtlsParameters
              })
              .then(callback)
              .catch(errback);
          }
        );
      }

      const { peers } = await this.peer.request("join", {
        displayName: this.displayName,
        device: this.device,
        rtpCapabilities: this.consume
          ? this.mediasoupDevice.rtpCapabilities
          : undefined,
        sctpCapabilities:
          this.useDataChannel && this.consume
            ? this._mediasoupDevice.sctpCapabilities
            : undefined
      });

      this.connected = true;
    },
    async setMaxSendingSpatialLayer(spatialLayer) {
      console.debug(
        "setMaxSendingSpatialLayer() [spatialLayer:%s]",
        spatialLayer
      );

      try {
        if (this.webcamProducer)
          await this.webcamProducer.setMaxSpatialLayer(spatialLayer);
        else if (this.shareProducer)
          await this.shareProducer.setMaxSpatialLayer(spatialLayer);
      } catch (error) {
        console.error("setMaxSendingSpatialLayer() | failed:%o", error);

        this.$q.notify({
          color: "negative",
          message: `Error setting max sending video spatial layer: ${error}`
        });
      }
    },
    async setConsumerPreferredLayers(consumerId, spatialLayer, temporalLayer) {
      console.debug(
        "setConsumerPreferredLayers() [consumerId:%s, spatialLayer:%s, temporalLayer:%s]",
        consumerId,
        spatialLayer,
        temporalLayer
      );

      try {
        await this.peer.request("setConsumerPreferredLayers", {
          consumerId,
          spatialLayer,
          temporalLayer
        });

        const consumer = this.consumers[consumerId];

        consumer.preferredSpatialLayer = spatialLayer;
        consumer.preferredTemporalLayer = temporalLayer;
      } catch (error) {
        console.error("setConsumerPreferredLayers() | failed:%o", error);

        this.$q.notify({
          color: "negative",
          message: `Error setting Consumer preferred layers: ${error}`
        });
      }
    },
    async setConsumerPriority(consumerId, priority) {
      console.debug(
        "setConsumerPriority() [consumerId:%s, priority:%d]",
        consumerId,
        priority
      );

      try {
        await this.peer.request("setConsumerPriority", {
          consumerId,
          priority
        });

        const consumer = this.consumers[consumerId];

        consumer.priority = priority;
      } catch (error) {
        console.error("setConsumerPriority() | failed:%o", error);

        this.$q.notify({
          color: "negative",
          message: `Error setting Consumer priority: ${error}`
        });
      }
    },
    async requestConsumerKeyFrame(consumerId) {
      console.debug("requestConsumerKeyFrame() [consumerId:%s]", consumerId);

      try {
        await this.peer.request("requestConsumerKeyFrame", { consumerId });

        this.$q.notify({
          message: "Keyframe requested for video consumer"
        });
      } catch (error) {
        console.error("requestConsumerKeyFrame() | failed:%o", error);

        this.$q.notify({
          color: "negative",
          message: `Error requesting key frame for Consumer: ${error}`
        });
      }
    },
    async getSendTransportRemoteStats() {
      console.debug("getSendTransportRemoteStats()");

      if (!this.sendTransport) return;

      return this.peer.request("getTransportStats", {
        transportId: this.sendTransport.id
      });
    },
    async getRecvTransportRemoteStats() {
      console.debug("getRecvTransportRemoteStats()");

      if (!this.recvTransport) return;

      return this.peer.request("getTransportStats", {
        transportId: this.recvTransport.id
      });
    },
    async getAudioRemoteStats() {
      console.debug("getAudioRemoteStats()");

      if (!this.micProducer) return;

      return this.peer.request("getProducerStats", {
        producerId: this.peer.id
      });
    },
    async getVideoRemoteStats() {
      console.debug("getVideoRemoteStats()");

      const producer = this.webcamProducer || this.shareProducer;

      if (!producer) return;

      return this._protoo.request("getProducerStats", {
        producerId: producer.id
      });
    },
    async getConsumerRemoteStats(consumerId) {
      console.debug("getConsumerRemoteStats()");

      const consumer = this.consumers[consumerId];

      if (!consumer) return;

      return this.peer.request("getConsumerStats", { consumerId });
    },
    async getSendTransportLocalStats() {
      console.debug("getSendTransportLocalStats()");

      if (!this.sendTransport) return;

      return this.sendTransport.getStats();
    },
    async getRecvTransportLocalStats() {
      console.debug("getRecvTransportLocalStats()");

      if (!this.recvTransport) return;

      return this.recvTransport.getStats();
    },

    async getAudioLocalStats() {
      console.debug("getAudioLocalStats()");

      if (!this.micProducer) return;

      return this.micProducer.getStats();
    },

    async getVideoLocalStats() {
      logger.debug("getVideoLocalStats()");

      const producer = this.webcamProducer || this.shareProducer;

      if (!producer) return;

      return producer.getStats();
    },

    async getConsumerLocalStats(consumerId) {
      const consumer = this.consumers[consumerId];

      if (!consumer) return;

      return consumer.getStats();
    },

    async applyNetworkThrottle({ uplink, downlink, rtt, secret }) {
      console.debug(
        "applyNetworkThrottle() [uplink:%s, downlink:%s, rtt:%s]",
        uplink,
        downlink,
        rtt
      );

      try {
        await this.peer.request("applyNetworkThrottle", {
          uplink,
          downlink,
          rtt,
          secret
        });
      } catch (error) {
        console.error("applyNetworkThrottle() | failed:%o", error);

        this.$q.notify({
          color: "negative",
          message: `Error applying network throttle: ${error}`
        });
      }
    },

    async resetNetworkThrottle({ silent = false, secret }) {
      console.debug("resetNetworkThrottle()");

      try {
        await this.peer.request("resetNetworkThrottle", { secret });
      } catch (error) {
        if (!silent) {
          console.error("resetNetworkThrottle() | failed:%o", error);

          this.$q.notify({
            color: "negative",
            message: `Error resetting network throttle: ${error}`
          });
        }
      }
    },
    async pauseConsumer(consumer) {
      if (consumer.paused) return;

      try {
        await this.peer.request("pauseConsumer", {
          consumerId: consumer.id
        });

        consumer.pause();

        consumer.locallyPaused = false;
      } catch (error) {
        console.error("_pauseConsumer() | failed:%o", error);

        this.$q.notify({
          color: "negative",
          message: `Error pausing Consumer: ${error}`
        });
      }
    },

    async resumeConsumer(consumer) {
      if (!consumer.paused) return;

      try {
        await this.peer.request("resumeConsumer", {
          consumerId: consumer.id
        });

        consumer.resume();

        consumer.locallyPaused = true;
      } catch (error) {
        logger.error("_resumeConsumer() | failed:%o", error);

        store.dispatch(
          requestActions.notify({
            type: "error",
            text: `Error resuming Consumer: ${error}`
          })
        );
      }
    },

    async _getExternalVideoStream() {
      if (this.externalVideoStream) return this.externalVideoStream;

      if (this.externalVideo.readyState < 3) {
        await new Promise(resolve =>
          this.externalVideo.addEventListener("canplay", resolve)
        );
      }

      if (this.externalVideo.captureStream)
        this.externalVideoStream = this.externalVideo.captureStream();
      else if (this_externalVideo.mozCaptureStream)
        this._externalVideoStream = this.externalVideo.mozCaptureStream();
      else throw new Error("video.captureStream() not supported");

      return this.externalVideoStream;
    }
  }
};
</script>
