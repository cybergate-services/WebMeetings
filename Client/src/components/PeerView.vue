<template>
  <div class="video-container">
    <video ref="video" class="full-width" muted autoplay v-if="videoStream" />

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
      <q-btn class="q-ml-md" :icon="evaVideoOutline" round color="pink" size="12px">
        <q-tooltip
          anchor="center left"
          self="center right"
          transition-show="scale"
          transition-hide="scale"
          content-class="text-primary bg-accent"
        >Iniciar vídeo</q-tooltip>
      </q-btn>
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
      volume: 0
    };
  },
  watch: {
    videoStream: {
      handler(val) {
        this.$nextTick(() => {
          if (val) {
            this.$refs.video.srcObject = val;
          }
        });
      },
      immediate: true
    }
  },
  computed: {
    videoStream() {
      const videoProducer = this.peer.consumers.find(
        consumer => consumer.type === "simple"
      );

      if (videoProducer) {
        const videoStream = new MediaStream();

        videoStream.addTrack(videoProducer.track);

        return videoStream;
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
