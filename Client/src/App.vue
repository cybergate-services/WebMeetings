<template>
  <div id="q-app">
    <router-view />
  </div>
</template>

<script >
import protooClient from 'protoo-client';

export default {
  name: 'App',
  created(){
    const protooTransport = new protooClient.WebSocketTransport("wss://commercifly.ml");
  }
}
</script>
