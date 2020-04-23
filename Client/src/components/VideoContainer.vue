<template>
  <q-card class="bg-primary video-container">
    <video ref="video" class="fit" muted autoplay v-if="videoStream" />

    <div class="column absolute-right no-wrap q-pr-sm full-height controls justify-center">
      <q-btn :icon="evaMicOutline" round color="pink" class="q-mb-sm">
        <q-tooltip
          anchor="center left"
          self="center right"
          transition-show="scale"
          transition-hide="scale"
          content-class="text-primary bg-accent"
        >Ativar áudio</q-tooltip>
      </q-btn>

      <q-btn
        v-if="sharingVideo"
        :icon="evaVideoOffOutline"
        round
        color="accent"
        text-color="primary"
        class="q-mb-sm"
        @click="$emit('disableVideo')"
      >
        <q-tooltip
          anchor="center left"
          self="center right"
          transition-show="scale"
          transition-hide="scale"
          content-class="text-primary bg-accent"
        >Cancelar compartilhamento de vídeo</q-tooltip>
      </q-btn>

      <q-btn v-else :icon="evaVideoOutline" round color="pink" class="q-mb-sm" @click="$emit('enableVideo')">
        <q-tooltip
          anchor="center left"
          self="center right"
          transition-show="scale"
          transition-hide="scale"
          content-class="text-primary bg-accent"
        >Compartilhar vídeo</q-tooltip>
      </q-btn>

      <q-btn
        :icon="evaDownloadOutline"
        v-if="sharingScreen"
        round
        color="accent"
        text-color="primary"
        @click="$emit('disableShare')"
      >
        <q-tooltip
          anchor="center left"
          self="center right"
          transition-show="scale"
          transition-hide="scale"
          content-class="text-primary bg-accent"
        >Cancelar compartilhamento de tela</q-tooltip>
      </q-btn>

      <q-btn v-else :icon="evaUploadOutline" round color="pink" @click="$emit('enableShare')">
        <q-tooltip
          anchor="center left"
          self="center right"
          transition-show="scale"
          transition-hide="scale"
          content-class="text-primary bg-accent"
        >Compartilhar tela</q-tooltip>
      </q-btn>
    </div>

    <div class="row absolute-bottom text-subtitle1 no-wrap q-px-md q-pb-sm full-width controls">
      <q-icon
        :name="volume == 0 ? evaVolumeOffOutline : (volume <= 20 ? evaVolumeDownOutline: evaVolumeUpOutline)"
        size="40px"
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
  </q-card>
</template>
<style scoped>
.video-container {
  width: 400px;
  height: 400px;
}

.video-container .controls {
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
}

.video-container:not(:hover) .controls {
  transition-delay: 0.3s;
}

.video-container:hover .controls,
.video-container:active .controls {
  opacity: 1;
}
</style>

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
  name: "VideoContainer",
  props: {
    producers: Object,
    sharingScreen: Boolean,
    sharingVideo: Boolean
  },
  data() {
    return {
      volume: 50
    };
  },
  watch: {
    videoStream(val) {
      this.$nextTick(() => {
        if (val) {
          this.$refs.video.srcObject = val;
        }
      });
    }
  },
  computed: {
    videoStream() {
      const videoProducer = Object.values(this.producers).find(
        producer => producer.type === "share"
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
