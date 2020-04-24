<template>
  <q-dialog ref="dialog" no-esc-dismiss no-backdrop-dismiss @hide="onDialogHide">
    <q-card class="shadow-2" square>
      <q-card-section class="flex flex-center">
        <q-icon :name="evaAlertCircleOutline" size="96px" color="warning" />
      </q-card-section>

      <q-card-section class="text-caption">Seu acesso ainda não está autorizado para este conteúdo.</q-card-section>
    </q-card>
  </q-dialog>
</template>

<script>
import { evaAlertCircleOutline } from "@quasar/extras/eva-icons";

export default {
  created() {
    this.evaAlertCircleOutline = evaAlertCircleOutline;
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
      this.$emit("ok");
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