<template>
  <q-dialog ref="dialog" no-esc-dismiss no-backdrop-dismiss @hide="onDialogHide">
    <q-card class="shadow-2" square>
      <q-card-section class="text-black">
        <div class="text-caption text-center">
          Olá&nbsp;
          <strong>{{displayName}}</strong>, defina como deseja ingressar na conferência:
        </div>
        <div>
          <q-toggle
            v-model="shareWebcam"
            size="40px"
            :checked-icon="evaVideoOutline"
            color="pink"
            label="Compartilhando vídeo"
            :unchecked-icon="evaVideoOffOutline"
          />
        </div>
        <div>
          <q-toggle
            v-model="shareScreen"
            size="40px"
            :checked-icon="evaUploadOutline"
            color="pink"
            label="Compartilhando tela"
            :unchecked-icon="evaDownloadOutline"
          />
        </div>
        <div>
          <q-toggle
            v-model="shareAudio"
            size="40px"
            :checked-icon="evaMicOutline"
            color="pink"
            label="Compartilhando áudio"
            :unchecked-icon="evaMicOffOutline"
          />
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn label="Entrar" color="primary" @click="onOKClick"/>
        <q-btn label="Cancelar" color="negative" flat @click="onCancelClick"/>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import {
  evaMicOutline,
  evaMicOffOutline,
  evaVideoOffOutline,
  evaVideoOutline,
  evaUploadOutline,
  evaDownloadOutline
} from "@quasar/extras/eva-icons";

export default {
  props: {
    displayName: {
      type: String,
      default: "Diego"
    }
  },
  data() {
    return {
      shareScreen: false,
      shareAudio: false,
      shareWebcam: false
    };
  },
  watch: {
    shareScreen(val){
      if(val){
        this.shareWebcam = false;
      }
    },
    shareWebcam(val){
      if(val){
        this.shareScreen = false;
      }
    }
  },
  created() {
    this.evaMicOutline = evaMicOutline;
    this.evaMicOffOutline = evaMicOffOutline;
    this.evaVideoOutline = evaVideoOutline;
    this.evaVideoOffOutline = evaVideoOffOutline;
    this.evaUploadOutline = evaUploadOutline;
    this.evaDownloadOutline = evaDownloadOutline;
  },
  methods: {
    // following method is REQUIRED
    // (don't change its name --> "show")
    show() {
      this.$refs.dialog.show();
    },

    // following method is REQUIRED
    // (don't change its name --> "hide")
    hide() {
      this.$refs.dialog.hide();
    },

    onDialogHide() {
      // required to be emitted
      // when QDialog emits "hide" event
      this.$emit("hide");
    },

    onOKClick() {
      // on OK, it is REQUIRED to
      // emit "ok" event (with optional payload)
      // before hiding the QDialog
      this.$emit("ok", {shareScreen: this.shareScreen, shareAudio: this.shareAudio, shareWebcam: this.shareWebcam});
      // or with payload: this.$emit('ok', { ... })

      // then hiding dialog
      this.hide();
    },

    onCancelClick() {
      // we just need to hide dialog
      this.hide();
    }
  }
};
</script>