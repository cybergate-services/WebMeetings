<template>
  <q-responsive :ratio="16/9" class="video-container">
    <div>
      <video ref="video" class="fit" muted autoplay v-if="videoStream" playsinline />
      <div class="username">{{displayName}}</div>
    </div>
  </q-responsive>
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
