'use strict' //Enables strict mode is JavaScript
let url = new URL(document.location.href)
let gc_region = url.searchParams.get('gc_region')
let gc_clientId = url.searchParams.get('gc_clientId')
let gc_redirectUrl = url.searchParams.get('gc_redirectUrl')
let userId
let agentParticipantId
let answered = false

//Getting and setting the GC details from dynamic URL and session storage
gc_region ? sessionStorage.setItem('gc_region', gc_region) : (gc_region = sessionStorage.getItem('gc_region'))
gc_clientId ? sessionStorage.setItem('gc_clientId', gc_clientId) : (gc_clientId = sessionStorage.getItem('gc_clientId'))
gc_redirectUrl ? sessionStorage.setItem('gc_redirectUrl', gc_redirectUrl) : (gc_redirectUrl = sessionStorage.getItem('gc_redirectUrl'))

let platformClient = require('platformClient')
const client = platformClient.ApiClient.instance
const uapi = new platformClient.UsersApi()
const napi = new platformClient.NotificationsApi()
const papi = new platformClient.PresenceApi()
const capi = new platformClient.ConversationsApi()
const tapi = new platformClient.TaskManagementApi()

async function start() {
  try {
    client.setEnvironment(gc_region)
    client.setPersistSettings(true, '_mm_')

    console.log('%cLogging in to Genesys Cloud', 'color: green')
    await client.loginImplicitGrant(gc_clientId, gc_redirectUrl, {})

    //GET Current UserId
    let user = await uapi.getUsersMe({ expand: ['presence'] })
    console.log(user)
    userId = user.id
    coreAddUser(user.name, user.images[0].imageUri)

    //Enter in additional starting code.
    try {
      //Need to store wss as only can have 15 per agent. Also bad practice to create multiply
      const conversationsTopic = `v2.users.${userId}.conversations`
      const workitemsTopic = `v2.taskmanagement.workitems.users.${userId}`
      const presence = `v2.users.${userId}.presence`

      if (sessionStorage.getItem('gc_channelid')) {
        console.log('channelid already exists...')
        var channelid = sessionStorage.getItem('gc_channelid')

        // prettier-ignore
        await napi.postNotificationsChannelSubscriptions(channelid, [{id: conversationsTopic}, {id: workitemsTopic}, {id: presence}])
        console.log(`%cSubscribed to topics ${conversationsTopic} & ${workitemsTopic} & ${presence}`, 'color: green')
      } else {
        let channel = await napi.postNotificationsChannels()
        console.log('Created Notification Channel: ', channel)

        // prettier-ignore
        await napi.postNotificationsChannelSubscriptions(channel.id, [{id: conversationsTopic}, {id: workitemsTopic}, {id: presence}])
        console.log(`Subscribed to topics ${conversationsTopic} & ${workitemsTopic} & ${presence}`)
        sessionStorage.setItem('gc_channelid', channel.id)
      }
    } catch (err) {
      console.error('Notification Error: ', err)
    }

    //Create websocket for events
    try {
      let socket = new WebSocket(`wss://streaming.${gc_region}/channels/${sessionStorage.getItem('gc_channelid')}`)

      socket.onmessage = async function (event) {
        let details = JSON.parse(event.data)
        //console.log(`%c${details}`, 'color: blue')

        details?.eventBody?.message === 'WebSocket Heartbeat' ? console.log('%c%s Heartbeat', 'color: red', '❤️') : null
        //if Message notification
        if (details.topicName.includes('conversations')) {
          console.log('conversation Notification: ', details)
          // prettier-ignore
          let customer = details.eventBody.participants.slice().reverse().find(p => p.purpose === 'customer' && p.calls[0].state === 'connected')
          // prettier-ignore
          let agentAlerting = details.eventBody.participants.slice().reverse().find(p => p.purpose === 'agent' && p.calls[0].state === 'alerting')
          if (agentAlerting && !answered) {
            answered = true
            coreNotification('voice call', 'success')
            coreBuildIncoming(details.eventBody.id, 'testQueue', customer.name)
          }
          // prettier-ignore
          let agentParticipantConnected = details.eventBody.participants.slice().reverse().find(p => p.purpose === 'agent' && p.calls[0].state === 'connected')
          if (agentParticipantConnected && !answered) {
            answered = true
            agentParticipantId = agentParticipantConnected.id
            console.log('CONNECTED')
            coreBuildIncoming(details.eventBody.id, 'testQueue', customer.name)
          }
          // prettier-ignore
          let agentParticipantDisconnected = details.eventBody.participants.slice().reverse().find((p) => p.purpose === 'agent' && p.calls[0].state === 'disconnected')
          if (agentParticipantDisconnected && agentParticipantDisconnected.wrapupExpected) {
            console.log('DISCONNECTED & NEEDS WRAP')
            let wrapupCodes = await capi.getConversationsCallParticipantWrapupcodes(details.eventBody.id, agentParticipantDisconnected.id)
            console.log(wrapupCodes)
            eventsWrapUpModel(details.eventBody.id, wrapupCodes)
            document.getElementById(details.eventBody.id).remove()
            answered = false
          }
        }
        if (details.topicName.includes('work')) {
          console.log('workItem')
          let item2 = await tapi.getTaskmanagementWorkitem(details.eventBody.id,  {
            expands: 'status',
          })
          details.eventBody.assignmentState === "Connected" ? coreBuildConnectedWorkItem(details.eventBody.id, details.eventBody.name, details.eventBody.statusCategory, details.eventBody.description, item2.status.name) : coreBuildParkedWorkItem(details.eventBody.id, details.eventBody.name, details.eventBody.statusCategory, details.eventBody.description, item2.status.name)
        }
        if (details.topicName.includes('presence')) {
          let presence = details.eventBody.presenceDefinition.systemPresence
          console.log(`Presence: ${presence}`)
          if (presence === 'AVAILABLE') {
            document.getElementById('dropdown').value = 'AVAILABLE'
            document.getElementById('avatarImage').style.boxShadow = '0 0 0 2pt #77dd22'
          }
          if (presence === 'BUSY') {
            document.getElementById('dropdown').value = 'BUSY'
            document.getElementById('avatarImage').style.boxShadow = '0 0 0 2pt #ff0000'
          }
          if (presence === 'ON_QUEUE') {
            document.getElementById('dropdown').value = 'ON_QUEUE'
            document.getElementById('avatarImage').style.boxShadow = '0 0 0 2pt #52cef8'
          }
        }
      }
      console.log(`Waiting for events on wss://streaming.${gc_region}/channels/${sessionStorage.getItem('gc_channelid')}`)
    } catch (err) {
      console.error('Websocket error: ', err)
    }
  } catch (err) {
    console.log('Error: ', err)
  }
} //End of start() function

start()
coreQueryWorkitems()

function coreAddUser(name, image, id) {
  let badge = document.createElement('div')
  badge.style = `min-width: 300px;
      display: flex;
      margin: 20px;
      float: left;
      background: #FFF;
      border-radius: 4px;
      box-shadow: 1px 1px 5px rgba(0, 0, 0, .2);`

  let avatar = document.createElement('div')
  avatar.id = 'avatarId'
  avatar.style = `padding: 8px; align-self: center;`

  let img = document.createElement('img')
  img.id = 'avatarImage'
  image ? (img.src = image) : (img.src = 'https://dhqbrvplips7x.cloudfront.net/directory/10.36.0-2/assets/images/svg/person.svg')
  img.style = `float: left;
      padding: 1px;
      border-radius: 50%;
      box-shadow: 0 0 0 2pt grey;
      height: 48px;
      width: 48px;`

  let txt = document.createElement('h1')
  txt.id = 'avatarText'
  txt.innerHTML = name
  txt.style = `width: 100%; text-align: center;`

  avatar.appendChild(img)
  badge.appendChild(avatar)
  badge.appendChild(txt)

  document.getElementById('users').appendChild(badge)
}

function coreNotification(message, type) {
  //success warning error
  let notificaiton = document.createElement('gux-inline-alert-beta')
  notificaiton.setAttribute('accent', type)
  notificaiton.innerHTML = message
  notificaiton.id = 'notification'
  notificaiton.style = `position: fixed;
  padding: 38px;
  width: 50%;
  z-index: 99999`
  document.getElementById('users').appendChild(notificaiton)
  setTimeout(() => {
    document.getElementById('notification').remove()
  }, 5000)
}

async function coreBuildScript(conversationId) {
  let iframe = document.createElement('iframe')
  iframe.id = 'iframe'
  iframe.src = `https://apps.mypurecloud.com.au/scripter/?locale=en-us&user=${userId}#interactionId=${conversationId}`
  iframe.style = 'height: 60vh; width: 100%;'
  document.body.appendChild(iframe)
}

async function coreQueryWorkitems() {
  let body = {
    filters: [
      { name: 'workbinId', type: 'String', operator: 'EQ', values: ['9a9a1b6d-fd97-4a09-9d76-6142e786e27c'] },
      { name: 'statusCategory', type: 'String', operator: 'NEQ', values: ['Closed'] },
      { name: 'assigneeId', type: 'String', operator: 'EQ', values: ['3f5abe86-9b80-4995-851a-5ed45f48a575'] },
    ],
    sort: { name: 'dateDue', ascending: true },
    pageSize: 200,
    expands: ['status', 'queue', 'type', 'assignee'],
  }

  let getWork = await tapi.postTaskmanagementWorkitemsQuery(body)
  console.log(getWork)

  for (const item of getWork.entities) {
    item.assignmentState === "Connected" ? coreBuildConnectedWorkItem(item.id, item.name, item.statusCategory, item.description, item.status.name) : coreBuildParkedWorkItem(item.id, item.name, item.statusCategory, item.description, item.status.name)
  }
}

async function coreBuildParkedWorkItem(workitemId, heading, status, body, statusName) {
  let card = document.createElement('gux-card-beta')
  let div = document.createElement('div')
  let h2 = document.createElement('h2')
  let h4 = document.createElement('h4')
  let button = document.createElement('gux-button')
  let p = document.createElement('p')

  card.id = workitemId
  card.setAttribute('accent', 'filled')
  card.style = 'width: 100%; padding-top: 12px;'
  div.style = 'display: flex;'
  h2.innerText = heading
  h4.innerText = status + "-" + statusName
  h4.style.padding = '8px'
  h4.style.color = 'white'
  if (status === 'Open') h4.style.backgroundColor = '#8452cf'
  if (status === 'InProgress') h4.style.backgroundColor = '#3c8527'
  if (status === 'Hold') h4.style.backgroundColor = '#ffae00'
  if (status === 'Closed') h4.style.backgroundColor = '#203b73'
  button.id = 'open'
  button.style = 'position: absolute; right: 40px;'
  button.innerText = 'Open'
  p.innerText = body

  div.appendChild(h2)
  div.appendChild(button)
  card.appendChild(div)
  card.appendChild(h4)
  card.appendChild(p)
  document.getElementById('workbin').appendChild(card)
}

async function coreBuildConnectedWorkItem(workitemId, heading, status, body, statusName) {
  let card = document.createElement('gux-card-beta')
  let div = document.createElement('div')
  let h2 = document.createElement('h2')
  let h4 = document.createElement('h4')
  let buttonPark = document.createElement('gux-button')
  let buttonDetails = document.createElement('gux-button')
  let buttonStatus = document.createElement('gux-button')
  let buttonTest = document.createElement('gux-button')
  let p = document.createElement('p')

  card.id = workitemId
  card.setAttribute('accent', 'filled')
  card.style = 'width: 100%; padding-top: 12px;'
  div.style = 'display: flex;'
  h2.innerText = heading
  h4.innerText = status + "-" + statusName
  h4.style.padding = '8px'
  h4.style.color = 'white'
  if (status === 'Open') h4.style.backgroundColor = '#8452cf'
  if (status === 'InProgress') h4.style.backgroundColor = '#3c8527'
  if (status === 'Hold') h4.style.backgroundColor = '#ffae00'
  if (status === 'Closed') h4.style.backgroundColor = '#203b73'

  buttonPark.id = 'parkTask'
  buttonPark.style = 'position: absolute; right: 40px;'
  buttonPark.innerText = 'Park'
  buttonDetails.id = 'detailsTask'
  buttonDetails.style = 'position: absolute; right: 120px;'
  buttonDetails.innerText = 'Details'
  buttonStatus.id = 'statusChange'
  buttonStatus.style = 'position: absolute; right: 200px;'
  buttonStatus.innerText = 'Change Status'
  //buttonTest.id = 'buttonTest'
  //buttonTest.style = 'position: absolute; right: 280px;'
  //buttonTest.innerText = 'Test'
  buttonDetails.setAttribute('accent', 'primary')
  p.innerText = body

  div.appendChild(h2)
  div.appendChild(buttonPark)
  div.appendChild(buttonDetails)
  div.appendChild(buttonStatus)
  //div.appendChild(buttonTest)
  card.appendChild(div)
  card.appendChild(h4)
  card.appendChild(p)
  document.getElementById('active').appendChild(card)
}

async function coreBuildIncoming(conversationId, queueName, name, communicationId, participantId, mediaType) {
  let card = document.createElement('gux-card-beta')
  let div = document.createElement('div')
  let ani = document.createElement('h2')
  let queue = document.createElement('h4')
  let answerButton = document.createElement('gux-button')
  let muteButton = document.createElement('gux-button')
  let unmuteButton = document.createElement('gux-button')
  let disconnectButton = document.createElement('gux-button')
  let muteIcon = document.createElement('gux-icon')
  let unmuteIcon = document.createElement('gux-icon')
  let p = document.createElement('p')

  card.id = conversationId
  // card.setAttribute('data-communicationId', communicationId)
  // card.setAttribute('data-participantId', participantId)
  // card.setAttribute('data-mediaType', mediaType)
  card.setAttribute('accent', 'filled')
  card.style = 'width: 100%; padding-top: 12px;'
  div.style = 'display: flex; justify-content: space-evenly'
  ani.innerText = name
  queue.innerText = queueName
  //queue.style.padding = '8px'
  //queue.style.color = 'white'
  // if(status === 'Open') h4.style.backgroundColor = '#8452cf'
  // if(status === 'InProgress') h4.style.backgroundColor = '#3c8527'
  // if(status === 'Hold') h4.style.backgroundColor = '#ffae00'
  // if(status === 'Closed') h4.style.backgroundColor = '#203b73'
  answerButton.id = 'answer'
  answerButton.innerText = 'answer'
  disconnectButton.id = 'disconnect'
  disconnectButton.innerText = 'Disconnect'
  muteIcon.id = 'mute'
  muteIcon.setAttribute('icon-name', 'microphone-disable')
  muteIcon.setAttribute('decorative', '')
  unmuteIcon.id = 'unmute'
  unmuteIcon.setAttribute('icon-name', 'microphone')
  unmuteIcon.setAttribute('decorative', '')
  p.innerText = 'body'

  muteButton.appendChild(muteIcon)
  unmuteButton.appendChild(unmuteIcon)
  div.appendChild(answerButton)
  div.appendChild(muteButton)
  div.appendChild(unmuteButton)
  div.appendChild(disconnectButton)
  card.appendChild(ani)
  card.appendChild(queue)
  card.appendChild(p)
  card.appendChild(div)
  document.getElementById('active').appendChild(card)
}
