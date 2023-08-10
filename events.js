let systemPresences = []

window.addEventListener('click', async (e) => {
  switch (e.target.id) {
    case 'answer':
      webrtcAnswer()
      break
    case 'disconnect':
      eventsDisconnect()
      break
    case 'mute':
      eventsMute(true)
      break
    case 'unmute':
      eventsMute(false)
      break
    case 'call':
      webrtcCall('61400023469')
      break
    case 'AVAILABLE':
    case 'BUSY':
    case 'ON_QUEUE':
      eventsSetStatus(e.target.id)
      break
    case 'open':
      console.log(e.target)
      console.log(`UnParked WorkItemId: ${e.target.parentNode.parentNode.id}`)
      eventsUnPark(e.target.parentNode.parentNode.id)
      document.getElementById(e.target.parentNode.parentNode.id).remove()
      break
    case 'parkTask':
      console.log('PARK TASK')
      eventsPark(e.target.parentNode.parentNode.id)
      document.getElementById(e.target.parentNode.parentNode.id).remove()
      break
    case 'detailsTask':
      eventsWorkItemDetails(e.target.parentNode.parentNode.id)
      break
    case 'statusChange':
      console.log('Change Status 2nd Level')
      eventsStatusSecondLevel(e.target.parentNode.parentNode.id)
      document.getElementById(e.target.parentNode.parentNode.id).remove()
      break
    default:
      console.log(e.target.id)
  }
})

async function notify(event) {
  console.log(event.target.innerText)
}

async function eventsDisconnect() {
  if (activeCall) {
    activeCall = false
    let disconnect = await capi.patchConversationsCall(conversationId, {
      state: 'disconnected',
    })
    console.log(disconnect)
  }
}

async function eventsMute(flag) {
  let mute = await capi.patchConversationsCallParticipant(conversationId, agentParticipantId, {
    muted: flag,
  })
  console.log(mute)
}

async function eventsSetStatus(status) {
  console.log(`Setting Status to: ${status}`)
  //get system status if not in cache
  if (systemPresences.length === 0) {
    let system = await papi.getPresencedefinitions({ pageSize: 100 })
    console.log(system)
    let AVAILABLE = system.entities.find((p) => p.primary === true && p.systemPresence === 'Available')
    let BUSY = system.entities.find((p) => p.primary === true && p.systemPresence === 'Busy')
    let ON_QUEUE = system.entities.find((p) => p.primary === true && p.systemPresence === 'On Queue')
    systemPresences.push({ name: 'AVAILABLE', id: AVAILABLE.id })
    systemPresences.push({ name: 'BUSY', id: BUSY.id })
    systemPresences.push({ name: 'ON_QUEUE', id: ON_QUEUE.id })
  }

  let setPres = await papi.patchUserPresencesPurecloud(userId, {
    presenceDefinition: {
      id: systemPresences.find((n) => n.name === status).id,
    },
  })
  console.log(setPres)
  if (status === 'AVAILABLE') document.getElementById('avatarImage').style.boxShadow = '0 0 0 2pt #77dd22'
  if (status === 'BUSY') document.getElementById('avatarImage').style.boxShadow = '0 0 0 2pt #ff0000'
  if (status === 'ON_QUEUE') document.getElementById('avatarImage').style.boxShadow = '0 0 0 2pt #52cef8'
}

async function eventsUnPark(workItemId) {
  let item = await tapi.patchTaskmanagementWorkitem(workItemId, {
    assignmentState: 'Connected',
  })
  console.log(item)
}

async function eventsPark(workItemId) {
  let item = await tapi.patchTaskmanagementWorkitem(workItemId, {
    assignmentState: 'Parked',
  }) 
  console.log(item)
}

async function eventsStatusSecondLevel(workItemId) {
  let item = await tapi.patchTaskmanagementWorkitem(workItemId, {
    statusId: '930c6cf3-bf19-4806-8a9c-600587a885e9',
  }) 
  console.log(item)
}

async function eventsWorkItemDetails(workItemId) {
  let details = await tapi.getTaskmanagementWorkitem(workItemId)
  console.log(details)

  let div = document.createElement('div')
  let modal = document.createElement('gux-modal')
  let slot1 = document.createElement('div')
  let slot2 = document.createElement('div')
  let slot3 = document.createElement('div')
  let slot4 = document.createElement('div')
  let buttonCall = document.createElement('gux-button')
  let buttonEmail = document.createElement('gux-button')

  modal.setAttribute('initial-focus', '#call')
  modal.setAttribute('size', 'small')
  slot1.slot = 'title'
  slot1.innerText = 'Workitem Title'
  slot2.slot = 'content'
  slot2.innerText = `address_text: ${details.customFields.address_text}
  name_text: ${details.customFields.name_text}
  notes_longtext: ${details.customFields.notes_longtext}
  price_integer: ${details.customFields.price_integer}
  property_url: ${details.customFields.property_url}`

  slot3.slot = 'left-align-buttons'
  slot4.slot = 'right-align-buttons'
  buttonCall.id = 'call'
  buttonCall.onclick = function () {
    webrtcCall(details.customFields.mobile_text)
  }
  buttonCall.type = 'button'
  buttonCall.innerText = 'Call'
  buttonCall.setAttribute('accent', 'primary')
  buttonEmail.type = 'button'
  buttonEmail.innerText = 'Email'
  buttonEmail.id = 'email'

  div.id = 'modal-container'
  slot3.appendChild(buttonCall)
  slot4.appendChild(buttonEmail)
  modal.appendChild(slot1)
  modal.appendChild(slot2)
  modal.appendChild(slot3)
  modal.appendChild(slot4)
  div.appendChild(modal)
  document.getElementById('active').appendChild(div)
}

async function eventsWrapUpModel(conversataionId, codes) {
  let div = document.createElement('div')
  let modal = document.createElement('gux-modal')
  let slot1 = document.createElement('div')
  let slot2 = document.createElement('div')
  let slot3 = document.createElement('div')
  let dropdown = document.createElement('gux-dropdown')
  let listbox = document.createElement('gux-listbox')
  let buttonDone = document.createElement('gux-button')

  modal.setAttribute('initial-focus', '#call')
  modal.setAttribute('size', 'small')
  slot1.slot = 'title'
  slot1.innerText = 'Wrapup Selection'
  slot2.slot = 'content'
  dropdown.setAttribute('placeholder', 'Select a Wrapup')
  dropdown.id = 'wrapup_code'
  listbox.style = 'max-height: 50vh;'
  for (const wrap of codes) {
    let row = document.createElement('gux-option')
    row.value = wrap.id
    row.innerText = wrap.name
    listbox.appendChild(row)
  }

  slot3.slot = 'right-align-buttons'
  buttonDone.id = 'wrapup-done'
  buttonDone.onclick = async function () {
    let wrap = await capi.patchConversationsCall(conversationId, {
      state: 'disconnected',
      participants: [{ wrapup: {code: document.getElementById('wrapup_code').value} }],
    })
    console.log(wrap)
  }
  buttonDone.type = 'button'
  buttonDone.innerText = 'Done'
  buttonDone.setAttribute('accent', 'primary')

  div.id = 'modal-container'
  slot3.appendChild(buttonDone)
  dropdown.appendChild(listbox)
  slot2.appendChild(dropdown)
  modal.appendChild(slot1)
  modal.appendChild(slot2)
  modal.appendChild(slot3)
  div.appendChild(modal)
  document.getElementById('active').appendChild(div)
}
