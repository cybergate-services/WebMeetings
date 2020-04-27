<template>
  <div class="video-container" :class="{activeSpeaker: isActiveSpeaker}">
    <video ref="video" class="full-width" autoplay muted v-if="mediaStream" playsinline />

    <div class="username">{{peer.displayName}}</div>

    <div
      class="flex items-center absolute-bottom text-subtitle1 no-wrap q-px-md q-py-sm full-width controls"
    >
      <q-icon
        :name="volume == 0 ? evaVolumeOffOutline : (volume <= 20 ? evaVolumeDownOutline: evaVolumeUpOutline)"
        size="32px"
        left
      />
      <q-slider
        v-model="volume"
        dark
        :min="0"
        :max="100"
        label
        color="accent"
        class="col-grow"
        label-text-color="primary"
      />
    </div>
  </div>
</template>

<script>
import {
  evaVolumeUpOutline,
  evaVolumeOffOutline,
  evaVolumeDownOutline,
  evaMicOutline,
  evaMicOffOutline,
  evaVideoOffOutline,
  evaVideoOutline,
  evaUploadOutline,
  evaDownloadOutline
} from "@quasar/extras/eva-icons";

export default {
  name: "PeerView",
  props: {
    peer: Object,
    allowsAudio: Boolean,
    isActiveSpeaker: Boolean,
  },
  data() {
    return {
      volume: 100,
      hasAudio: false,
      hasVideo: false
    };
  },
  watch: {
    volume() {
      this.$nextTick(() => {
        this.$refs.video.volume = this.volume / 100;
      });
    },
    muted: {
      handler() {
        this.$nextTick(() => {
          if (!this.muted) {
            this.$refs.video.muted = this.muted;
          }
        });
      },
      immediate: true
    },
    mediaStream: {
      handler(val) {
        this.$nextTick(() => {
          if (this.mediaStream) {
            this.$refs.video.srcObject = this.mediaStream;
          }
        });
      },
      immediate: true
    }
  },
  computed: {
    muted() {
      return !this.allowsAudio || !this.hasAudio || this.volume == 0;
    },
    mediaStream() {
      if (this.peer.consumers.length > 0) {
        const mediaStream = new MediaStream();

        for(let track of this.peer.consumers.map(consumer => consumer.track)){
          mediaStream.addTrack(track);
        }

        return mediaStream;
      } else return null;
    }
  },
  created() {
    this.evaVolumeUpOutline = evaVolumeUpOutline;
    this.evaVolumeOffOutline = evaVolumeOffOutline;
    this.evaVolumeDownOutline = evaVolumeDownOutline;
    this.evaMicOutline = evaMicOutline;
    this.evaMicOffOutline = evaMicOffOutline;
    this.evaVideoOutline = evaVideoOutline;
    this.evaVideoOffOutline = evaVideoOffOutline;
    this.evaUploadOutline = evaUploadOutline;
    this.evaDownloadOutline = evaDownloadOutline;
  }
};
</script>
