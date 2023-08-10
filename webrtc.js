let activeCall = false

console.log(client.authData.accessToken)
let conversationId

//Enter in starting code.
sdk = new window.GenesysCloudWebrtcSdk.GenesysCloudWebrtcSdk({
  accessToken: client.authData.accessToken,
  environment: 'mypurecloud.com.au',
})

async function webrtcAnswer() {
  if(!activeCall){
    activeCall = true
    await sdk.acceptPendingSession({
      conversationId: conversationId,
    })
  }
}

async function webrtcCall(number) {
  if(!activeCall){
    activeCall = true
    await sdk.startSoftphoneSession({
      phoneNumber: number,
      callFromQueueId: '280d26ed-ea62-4e38-9f7e-c65f1b889b7e',
    })
  }
}

async function start(){
  await sdk.initialize()
  console.log('%cInitialized WebRTC SDK', 'color: green')
  sdk.on('pendingSession', (event) => {
    console.log('matt', event)
    conversationId = event.conversationId
  })
  sdk.on('sessionStarted', (event) => {
    console.log('%cStarted', 'color: green')
    event.on('stats', (stats) => {
      console.log('*** ', stats)
    })
  })
}

start()