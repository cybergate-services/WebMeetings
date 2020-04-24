<template>
  <div class="video-container">
    <video ref="video" class="full-width" autoplay muted v-if="mediaStream" />

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
    peer: Object
  },
  data() {
    return {
      volume: 0,
      hasAudio: false,
      hasVideo: false
    };
  },
  watch: {
    volume() {
      this.$nextTick(() => {
        this.$refs.video.volume = this.volume / 100;
        console.log(this.volume);
      });
    },
    muted: {
      handler() {
        this.$nextTick(() => {
          this.$refs.video.muted = this.muted;
        });
      },
      immediate: true
    },
    "peer.consumers": {
      handler(val) {
        if (val.length > 0) {
          let oldTracks = [...this.mediaStream.getTracks()];
          let newTracks = val.map(consumer => consumer.track);

          this.hasAudio = newTracks.some(track => track.kind === "audio");
          this.hasVideo = newTracks.some(track => track.kind === "video");

          for (const track of newTracks) {
            if (!oldTracks.includes(track)) {
              this.mediaStream.addTrack(track);
            }
          }

          for (const track of oldTracks) {
            if (!newTracks.includes(track)) {
              this.mediaStream.removeTrack(track);
            }
          }
        } else {
          this.hasAudio = false;
          this.hasVideo = false;
        }
      },
      immediate: true,
      deep: true
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
      return !this.hasAudio || this.volume == 0;
    },
    mediaStream() {
      if (this.peer.consumers.length > 0) {
        return new MediaStream();
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
