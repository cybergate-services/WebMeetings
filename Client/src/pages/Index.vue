<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn
          flat
          dense
          round
          :icon="evaMenuOutline"
          aria-label="Menu"
          @click="leftDrawerOpen = !leftDrawerOpen"
        />

        <q-toolbar-title>{{displayName}}</q-toolbar-title>

        <q-btn
          :icon="evaMicOutline"
          v-if="micProducer != null"
          round
          :loading="micInProgress"
          color="pink"
          class="q-mr-sm"
          dense
          @click="disableMic"
        >
          <q-tooltip
            anchor="bottom middle"
            self="top middle"
            transition-show="scale"
            transition-hide="scale"
            content-class="text-primary bg-accent"
          >Cancelar compartilhamento áudio</q-tooltip>
        </q-btn>

        <q-btn
          :icon="evaMicOffOutline"
          v-else
          round
          :loading="micInProgress"
          class="q-mr-sm"
          dense
          color="accent"
          text-color="primary"
          @click="enableMic"
        >
          <q-tooltip
            anchor="bottom middle"
            self="top middle"
            transition-show="scale"
            transition-hide="scale"
            content-class="text-primary bg-accent"
          >Compartilhar áudio</q-tooltip>
        </q-btn>

        <q-btn
          v-if="webcamProducer != null"
          :icon="evaVideoOutline"
          round
          class="q-mr-sm"
          dense
          color="pink"
          :loading="webcamInProgress"
          @click="disableWebcam"
        >
          <q-tooltip
            anchor="bottom middle"
            self="top middle"
            transition-show="scale"
            transition-hide="scale"
            content-class="text-primary bg-accent"
          >Cancelar compartilhamento de vídeo</q-tooltip>
        </q-btn>

        <q-btn
          v-else
          :icon="evaVideoOffOutline"
          round
          color="accent"
          text-color="primary"
          class="q-mr-sm"
          dense
          :loading="webcamInProgress"
          @click="enableWebcam"
        >
          <q-tooltip
            anchor="bottom middle"
            self="top middle"
            transition-show="scale"
            transition-hide="scale"
            content-class="text-primary bg-accent"
          >Compartilhar vídeo</q-tooltip>
        </q-btn>

        <q-btn
          :icon="evaUploadOutline"
          v-if="shareProducer != null"
          round
          dense
          color="pink"
          :loading="shareInProgress"
          @click="disableShare"
        >
          <q-tooltip
            anchor="bottom middle"
            self="top middle"
            transition-show="scale"
            transition-hide="scale"
            content-class="text-primary bg-accent"
          >Cancelar compartilhamento de tela</q-tooltip>
        </q-btn>

        <q-btn
          v-else
          :icon="evaDownloadOutline"
          round
          color="accent"
          text-color="primary"
          dense
          @click="enableShare"
          :loading="shareInProgress"
        >
          <q-tooltip
            anchor="bottom middle"
            self="top middle"
            transition-show="scale"
            transition-hide="scale"
            content-class="text-primary bg-accent"
          >Compartilhar tela</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered content-class="bg-grey-1 text-black">
      <q-list>
        <q-item-label header class="text-bold">Participantes</q-item-label>
        <q-item v-for="peer in Object.values(peers)" :key="peer.id" clickable v-ripple>
          <q-item-section>{{peer.displayName}}</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <q-page class="video-layout" :class="`children-${videoCount}`">
        <div v-if="webcamProducer || shareProducer">
          <VideoContainer :producers="producers" :displayName="displayName" />
        </div>
        <template v-for="peer in Object.values(peers)">
          <div :key="peer.id" v-if="peer.consumers.length > 0">
            <PeerView :peer="peer" :allowsAudio="allowsAudio" :isActiveSpeaker="activeSpeakerId === peer.id" />
          </div>
        </template>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script >
import protooClient from "protoo-client";
import * as mediasoupClient from "mediasoup-client";
import VideoContainer from "../components/VideoContainer";
import PeerView from "../components/PeerView";

import ErrorDialog from "../components/ErrorDialog";

import {
  evaVolumeUpOutline,
  evaVolumeOffOutline,
  evaVolumeDownOutline,
  evaMicOutline,
  evaMicOffOutline,
  evaVideoOffOutline,
  evaVideoOutline,
  evaUploadOutline,
  evaDownloadOutline,
  evaMenuOutline
} from "@quasar/extras/eva-icons";
import JoinDialog from "../components/JoinDialog.vue";

const VIDEO_CONSTRAINS = {
  low: {
    width: { ideal: 320 },
    aspectRatio: 1.334
  },
  medium: {
    width: { ideal: 640 },
    aspectRatio: 1.334
  },
  high: {
    width: { ideal: 1280 },
    aspectRatio: 1.334
  },
  veryhigh: {
    width: { ideal: 1920 },
    aspectRatio: 1.334
  }
};

const PC_PROPRIETARY_CONSTRAINTS = {
  optional: [{ googDscp: true }]
};

const VIDEO_SIMULCAST_ENCODINGS = [
  { scaleResolutionDownBy: 4 },
  { scaleResolutionDownBy: 2 },
  { scaleResolutionDownBy: 1 }
];

// Used for VP9 webcam video.
const VIDEO_KSVC_ENCODINGS = [{ scalabilityMode: "S3T3_KEY" }];

// Used for VP9 desktop sharing.
const VIDEO_SVC_ENCODINGS = [{ scalabilityMode: "S3T3", dtx: true }];

const ICE_SERVERS = [];

export default {
  name: "App",
  components: {
    VideoContainer,
    PeerView
  },
  watch: {
    peers: {
      handler(val) {
        console.log(val);
      },
      deep: true
    }
  },
  data() {
    return {
      leftDrawerOpen: false,
      consume: true,
      produce: true,
      useDataChannel: false,
      videoStream: null,
      connected: false,
      displayName: null,
      role: null,
      producers: {},
      consumers: {},
      peers: {},
      activeSpeakerId: null,
      shareProducer: null,
      webcamProducer: null,
      sendTransport: null,
      micProducer: null,
      webcamInProgress: false,
      micInProgress: false,
      shareInProgress: false,
      audioOnly: false,
      useSimulcast: true,
      useSharingSimulcast: false,
      canChangeWebcam: false,
      allowsAudio: false,
      webcam: {
        device: null,
        resolution: "medium"
      }
    };
  },
  computed: {
    videoCount() {
      return (
        (this.webcamProducer != null || this.shareProducer != null ? 1 : 0) +
        Object.values(this.peers).filter(peer => peer.consumers.length > 0).length
      );
    }
  },
  created() {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");

    const protooTransport = new protooClient.WebSocketTransport(
      `wss://${window.location.host}/ws?t=${t}`
    );

    this.peer = new protooClient.Peer(protooTransport);

    this.peer.on("open", this.joinRoom);

    this.peer.on("request", this.handleRequest);

    this.peer.on("notification", this.handleNotification);

    this.peer.on("failed", () => {
      this.$q.dialog({
        component: ErrorDialog
      });

      this.peer.close();
    });

    this.evaMenuOutline = evaMenuOutline;
    this.evaVolumeUpOutline = evaVolumeUpOutline;
    this.evaVolumeOffOutline = evaVolumeOffOutline;
    this.evaVolumeDownOutline = evaVolumeDownOutline;
    this.evaMicOutline = evaMicOutline;
    this.evaMicOffOutline = evaMicOffOutline;
    this.evaVideoOutline = evaVideoOutline;
    this.evaVideoOffOutline = evaVideoOffOutline;
    this.evaUploadOutline = evaUploadOutline;
    this.evaDownloadOutline = evaDownloadOutline;
  },
  methods: {
    getWebcamType(device) {
      if (/(back|rear)/i.test(device.label)) {
        console.debug("getWebcamType() | it seems to be a back camera");

        return "back";
      } else {
        console.debug("getWebcamType() | it seems to be a front camera");

        return "front";
      }
    },
    async enableMic() {
      console.debug("enableMic()");

      if (this.micProducer) return;

      if (!this.mediasoupDevice.canProduce("audio")) {
        console.error("enableMic() | cannot produce audio");

        return;
      }

      this.micInProgress = true;

      let track;

      try {
        if (!this.externalVideo) {
          console.debug("enableMic() | calling getUserMedia()");

          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true
          });

          track = stream.getAudioTracks()[0];
        } else {
          const stream = await this.getExternalVideoStream();

          track = stream.getAudioTracks()[0].clone();
        }

        this.micProducer = await this.sendTransport.produce({
          track,
          codecOptions: {
            opusStereo: 1,
            opusDtx: 1
          }
        });

        this.$set(this.producers, this.micProducer.id, {
          id: this.micProducer.id,
          paused: this.micProducer.paused,
          track: this.micProducer.track,
          rtpParameters: this.micProducer.rtpParameters,
          codec: this.micProducer.rtpParameters.codecs[0].mimeType.split("/")[1]
        });

        this.micProducer.on("transportclose", () => {
          this.micProducer = null;
        });

        this.micProducer.on("trackended", () => {
          this.$q.notify({
            color: "info",
            message: "Microphone disconnected!"
          });

          this.disableMic().catch(() => {});
        });
      } catch (error) {
        console.error("enableMic() | failed:%o", error);

        this.$q.notify({
          color: "negative",
          message: `Error enabling microphone: ${error}`
        });

        if (track) track.stop();
      } finally {
        this.micInProgress = false;
      }
    },
    async disableMic() {
      console.debug("disableMic()");

      if (!this.micProducer) return;

      this.micInProgress = true;

      this.micProducer.close();

      this.$delete(this.producers, this.micProducer.id);

      try {
        await this.peer.request("closeProducer", {
          producerId: this.micProducer.id
        });
      } catch (error) {
        this.$q.notify({
          color: "negative",
          message: `Error closing server-side mic Producer: ${error}`
        });
      } finally {
        this.micInProgress = false;
      }

      this.micProducer = null;
    },
    async enableWebcam() {
      console.debug("enableWebcam()");

      if (this.webcamProducer) return;
      else if (this.shareProducer) await this.disableShare();

      if (!this.mediasoupDevice.canProduce("video")) {
        console.error("enableWebcam() | cannot produce video");

        return;
      }

      let track;
      let device;

      this.webcamInProgress = true;

      try {
        if (!this.externalVideo) {
          await this.updateWebcams();
          device = this.webcam.device;

          const { resolution } = this.webcam;

          if (!device) throw new Error("no webcam devices");

          console.debug("enableWebcam() | calling getUserMedia()");

          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { ideal: device.deviceId },
              ...VIDEO_CONSTRAINS[resolution]
            }
          });

          track = stream.getVideoTracks()[0];
        } else {
          device = { label: "external video" };

          const stream = await this.getExternalVideoStream();

          track = stream.getVideoTracks()[0].clone();
        }

        if (this.useSimulcast) {
          // If VP9 is the only available video codec then use SVC.
          const firstVideoCodec = this.mediasoupDevice.rtpCapabilities.codecs.find(
            c => c.kind === "video"
          );

          let encodings;

          if (firstVideoCodec.mimeType.toLowerCase() === "video/vp9")
            encodings = VIDEO_KSVC_ENCODINGS;
          else encodings = VIDEO_SIMULCAST_ENCODINGS;

          this.webcamProducer = await this.sendTransport.produce({
            track,
            encodings,
            codecOptions: {
              videoGoogleStartBitrate: 1000
            }
          });
        } else {
          this.webcamProducer = await this.sendTransport.produce({
            track,
            appData: {
              source: "webcam"
            }
          });
        }

        this.$set(this.producers, this.webcamProducer.id, {
          id: this.webcamProducer.id,
          deviceLabel: device.label,
          type: this.getWebcamType(device),
          paused: this.webcamProducer.paused,
          track: this.webcamProducer.track,
          rtpParameters: this.webcamProducer.rtpParameters,
          codec: this.webcamProducer.rtpParameters.codecs[0].mimeType.split(
            "/"
          )[1]
        });

        this.webcamProducer.on("transportclose", () => {
          this.webcamProducer = null;
        });

        this.webcamProducer.on("trackended", () => {
          this.$q.notify({
            color: "negative",
            message: "Webcam disconnected!"
          });

          this.disableWebcam().catch(() => {});
        });
      } catch (error) {
        console.error("enableWebcam() | failed:%o", error);

        this.$q.notify({
          color: "info",
          message: `Error enabling webcam: ${error}`
        });

        if (track) track.stop();
      } finally {
        this.webcamInProgress = false;
      }
    },
    async disableWebcam() {
      console.debug("disableWebcam()");

      if (!this.webcamProducer) return;

      this.webcamProducer.close();

      this.$delete(this.producers, this.webcamProducer.id);

      try {
        await this.peer.request("closeProducer", {
          producerId: this.webcamProducer.id
        });
      } catch (error) {
        this.$q.notify({
          color: "negative",
          message: `Error closing server-side webcam Producer: ${error}`
        });
      }

      this.webcamProducer = null;
    },
    async enableShare() {
      if (!this.mediasoupDevice.canProduce("video")) {
        return;
      }

      if (this.webcamProducer) {
        await this.disableWebcam();
      }

      this.shareInProgress = true;

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

      if (this.useSharingSimulcast) {
        // If VP9 is the only available video codec then use SVC.
        const firstVideoCodec = this.mediasoupDevice.rtpCapabilities.codecs.find(
          c => c.kind === "video"
        );

        let encodings;

        if (firstVideoCodec.mimeType.toLowerCase() === "video/vp9") {
          encodings = VIDEO_SVC_ENCODINGS;
        } else {
          encodings = VIDEO_SIMULCAST_ENCODINGS.map(encoding => ({
            ...encoding,
            dtx: true
          }));
        }

        this.shareProducer = await this.sendTransport.produce({
          track,
          encodings,
          codecOptions: {
            videoGoogleStartBitrate: 1000
          },
          appData: {
            source: "screen"
          }
        });
      } else {
        this.shareProducer = await this.sendTransport.produce({
          track,
          appData: {
            source: "screen"
          }
        });
      }

      this.$set(this.producers, this.shareProducer.id, {
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

      this.shareInProgress = false;
    },
    async disableShare() {
      if (!this.shareProducer) return;

      this.shareInProgress = true;

      this.shareProducer.close();

      this.$delete(this.producers, this.shareProducer.id);

      try {
        await this.peer.request("closeProducer", {
          producerId: this.shareProducer.id
        });
      } catch (error) {
        this.$q.notify({
          type: "error",
          message: `Error closing server-side share Producer: ${error}`
        });
      } finally {
        this.shareInProgress = false;
      }

      this.shareProducer = null;
    },
    async handleRequest(request, accept, reject) {
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

              const peer = this.peers[peerId];

              peer.consumers.push({
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

              //debugger;

              // If audio-only mode is enabled, pause it.
              if (consumer.kind === "video" && this.audioOnly)
                this.pauseConsumer(consumer);
            } catch (error) {
              console.error('"newConsumer" request failed:%o', error);

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

          if (producer) producer.score = score;

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

          const peer = this.peers[peerId];

          // NOTE: This means that the Peer was closed before, so it's ok.
          if (!peer) break;

          const idx = peer.consumers.findIndex(
            consumer => consumer.id === consumerId
          );

          if (idx === -1) throw new Error("Consumer not found");

          peer.consumers.splice(idx, 1);

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
      const userInfo = await this.peer.request("userInfo");

      this.displayName = userInfo.displayName;
      this.role = userInfo.role;

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
          iceServers: ICE_SERVERS,
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
                transportId: this.sendTransport.id,
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
          iceServers: ICE_SERVERS
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
        device: this.device,
        rtpCapabilities: this.consume
          ? this.mediasoupDevice.rtpCapabilities
          : undefined,
        sctpCapabilities:
          this.useDataChannel && this.consume
            ? this._mediasoupDevice.sctpCapabilities
            : undefined
      });

      for (const peer of peers) {
        this.$set(this.peers, peer.id, {
          ...peer,
          consumers: [],
          dataConsumers: []
        });
      }

      this.connected = true;

      const { shareScreen, shareAudio, shareWebcam } = await new Promise(
        (resolve, reject) => {
          this.$q
            .dialog({
              component: JoinDialog,
              displayName: userInfo.displayName
            })
            .onOk(resolve)
            .onCancel(reject);
        }
      );

      this.allowsAudio = true;

      if (shareScreen) {
        this.enableShare().catch(() => {});
      }

      if (shareWebcam) {
        this.enableWebcam().catch(() => {});
      }

      if (shareAudio) {
        this.enableMic().catch(() => {});
      }
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
      console.debug("getVideoLocalStats()");

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
        console.error("resumeConsumer() | failed:%o", error);

        store.dispatch(
          requestActions.notify({
            type: "error",
            text: `Error resuming Consumer: ${error}`
          })
        );
      }
    },
    async getExternalVideoStream() {
      if (this.externalVideoStream) return this.externalVideoStream;

      if (this.externalVideo.readyState < 3) {
        await new Promise(resolve =>
          this.externalVideo.addEventListener("canplay", resolve)
        );
      }

      if (this.externalVideo.captureStream)
        this.externalVideoStream = this.externalVideo.captureStream();
      else if (this_externalVideo.mozCaptureStream)
        this.externalVideoStream = this.externalVideo.mozCaptureStream();
      else throw new Error("video.captureStream() not supported");

      return this.externalVideoStream;
    },
    async updateWebcams() {
      console.debug("updateWebcams()");

      // Reset the list.
      this.webcams = new Map();

      console.debug("updateWebcams() | calling enumerateDevices()");

      const devices = await navigator.mediaDevices.enumerateDevices();

      for (const device of devices) {
        if (device.kind !== "videoinput") continue;

        this.webcams.set(device.deviceId, device);
      }

      const array = Array.from(this.webcams.values());
      const len = array.length;
      const currentWebcamId = this.webcam.device
        ? this.webcam.device.deviceId
        : undefined;

      console.debug("updateWebcams() [webcams:%o]", array);

      if (len === 0) this.webcam.device = null;
      else if (!this.webcams.has(currentWebcamId))
        this.webcam.device = array[0];

      this.canChangeWebcam = this.webcams.size > 1;
    }
  }
};
</script>
