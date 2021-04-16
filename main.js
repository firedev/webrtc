import './style.css'
import firebase from 'firebase/app'
import 'firebase/firestore'


const answerButton = document.getElementById('answerButton')
const callButton = document.getElementById('callButton')
const callInput = document.getElementById('callInput')
const hangupButton = document.getElementById('hangupButton')
const remoteVideo = document.getElementById('remoteVideo')
const webcamButton = document.getElementById('webcamButton')
const webcamVideo = document.getElementById('webcamVideo')

const isControlsPresent =
  answerButton &&
  callButton &&
  callInput &&
  hangupButton &&
  remoteVideo &&
  webcamButton &&
  webcamVideo

if (!isControlsPresent) {
  console.log({
    answerButton,
    callButton,
    callInput,
    hangupButton,
    remoteVideo,
    webcamButton,
    webcamVideo,
  })
  alert('Controls are missing')
}

window.answerButton = answerButton
window.callButton = callButton
window.callInput = callInput
window.hangupButton = hangupButton
window.remoteVideo = remoteVideo
window.webcamButton = webcamButton
window.webcamVideo = webcamVideo

const firebaseConfig = {
  apiKey: "AIzaSyCf_pBURQ19U5mWEuKbzkHDvZYHf4gRVTo",
  authDomain: "adtown-1025.firebaseapp.com",
  projectId: "adtown-1025",
  storageBucket: "adtown-1025.appspot.com",
  messagingSenderId: "57378149116",
  appId: "1:57378149116:web:aca4a8dd2474dabbb2bd79",
  measurementId: "G-M8TTH284B1"
}

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig) }

console.log(firebase.apps)
const firestore = firebase.firestore()

const servers = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
      iceCandidatePoolSize: 10,
    }
  ]
}

let pc = new RTCPeerConnection(servers)
let localStream = null
let remoteStream = null

// 1. Setup sources

webcamButton.onclick = async () => {
  const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  const remoteStream = new MediaStream()

  // push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream)
  })


  // pull tracks from remote stream add to video
  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track)
    })
  }

  webcamVideo.srcObject = localStream
  remoteVideo.srcObject = remoteStream
}

// 2. Create an offer

callButton.onclick = async () => {
  const callDoc = firestore.collection('calls').doc()
  const offerCandidates = callDoc.collection('offerCandidates')
  const answerCandidates = callDoc.collection('answerCandidates')
  callInput.value = callDoc.id // created by firestore

  // store candidates for caller
  pc.onicecandidate = event => {
    event.candidate && offerCandidates.add(
      event.candidate.toJSON() // setup losteters BEFORE setLocalDescription
    )
  }

  // create offer
  const offerDescription = await pc.createOffer()
  await pc.setLocalDescription(offerDescription)
  const offer = {
    sdp: offerDescription.sdp, // v= protocol, o= originator id, s=session name
    type: offerDescription.type
  }
  await callDoc.set({ offer })

  // listen for answer fires when someone's answering
  callDoc.onSnapshot(snapshot => {
    const data = snapshot.data()
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer)
      pc.setRemoteDescription(answerDescription)
    }
  })

  // when answered add candidate to peer connection
  answerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data())
        pc.addIceCandidate(candidate)
      }
    })
  })
  hangupButton.disabled = false;
}

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value
  const callDoc = firestore.collection('calls').doc(callId)
  const answerCandidates = callDoc.collection('answerCandidates')
  const offerCandidates = callDoc.collection('offerCandidates')

  // store candidates for caller
  pc.onicecandidate = event => {
    event.candidate && answerCandidates.add(event.candidate.toJSON())
  }

  const callData = (await callDoc.get()).data()

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription))

  const answerDescription = await pc.createAnswer()
  await pc.setLocalDescription(answerDescription)

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  }
  await callDoc.update({ answer })

  offerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      console.log(change)
      if (change.type === 'added') {
        let data = change.doc.data()
        pc.addIceCandidate(new RTCIceCandidate(data))
      }
    })
  })
}
