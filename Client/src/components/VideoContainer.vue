<template>
  <div class="video-container">
    <q-responsive class="bg-black" :ratio="16/9">
      <video ref="video" muted autoplay v-if="videoStream" playsinline />
      <div class="username">{{displayName}}</div>
    </q-responsive>
  </div>
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
