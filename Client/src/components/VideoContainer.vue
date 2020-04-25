<template>
  <q-card class="video-container">
    <video ref="video" class="fit" muted autoplay v-if="videoStream" playsinline />
    <div class="username">
      {{displayName}}
    </div>
  </q-card>
</template>

<script>
export default {
  name: "VideoContainer",
  props: {
    producers: Object,
    displayName: String
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
      const videoProducer = Object.values(this.producers).find(
        producer =>
          producer.type === "share" ||
          producer.type === "back" ||
          producer.type === "front"
      );

      if (videoProducer) {
        const videoStream = new MediaStream();

        videoStream.addTrack(videoProducer.track);

        return videoStream;
      } else return null;
    }
  }
};
</script>
