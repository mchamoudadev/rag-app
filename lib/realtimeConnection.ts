/**
 * Utility for establishing a WebRTC connection to OpenAI's Realtime API
 */

import { RefObject } from 'react';

// Initialize a WebRTC connection with OpenAI's Realtime API
export async function createRealtimeConnection(
  ephemeralKey: string,
  audioElementRef: RefObject<HTMLAudioElement>
): Promise<{
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel;
}> {
  try {
    console.log('Creating WebRTC connection for Realtime API...');
    
    // Create a WebRTC peer connection with improved configuration
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all',
      // Standard WebRTC options for reliability
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    } as RTCConfiguration);
    
    // Set audio processing preferences
    if ((peerConnection as any).setCodecPreferences) {
      try {
        // Try to use higher quality codecs if supported
        const audioCapabilities = RTCRtpSender.getCapabilities('audio');
        if (audioCapabilities && audioCapabilities.codecs) {
          // Prioritize OPUS codec with higher bitrate
          const opusCodecs = audioCapabilities.codecs.filter(
            codec => codec.mimeType === 'audio/opus'
          );
          if (opusCodecs.length > 0) {
            console.log('Setting preferred audio codecs to OPUS');
            (peerConnection as any).setCodecPreferences(opusCodecs);
          }
        }
      } catch (e) {
        console.log('Codec preferences not supported:', e);
      }
    }
    
    // Setup ICE candidate event handler
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE candidate generated', event.candidate.candidate.substring(0, 50) + '...');
      }
    };
    
    // Monitor connection state
    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state changed to:', peerConnection.iceConnectionState);
    };
    
    // Simplified track handling - directly attach stream to audio element
    peerConnection.ontrack = (e) => {
      console.log('TRACK RECEIVED:', e);
      
      if (e.streams && e.streams.length > 0) {
        console.log('Audio stream received with', e.streams[0].getAudioTracks().length, 'audio tracks');
        
        // Simplified approach - just set the stream as srcObject
        if (audioElementRef.current) {
          console.log('Setting audio element srcObject directly');
          
          // Configure audio element for optimal playback
          audioElementRef.current.srcObject = e.streams[0];
          audioElementRef.current.autoplay = true;
          audioElementRef.current.muted = false;
          audioElementRef.current.volume = 1.0;
          
          // Force playback with retry logic
          const attemptPlayback = () => {
            if (!audioElementRef.current) return;
            
            audioElementRef.current.play()
              .then(() => console.log('✅ Audio playback started'))
              .catch((error: Error) => {
                console.error('❌ Audio playback failed:', error);
                
                // Create a visible user alert for mobile browsers that require interaction
                if (error.name === 'NotAllowedError') {
                  console.warn('Browser requires user interaction to play audio');
                  
                  // Create a button that users can click to enable audio
                  const enableButton = document.createElement('button');
                  enableButton.innerHTML = '🔊 Enable Audio';
                  enableButton.style.position = 'fixed';
                  enableButton.style.bottom = '20px';
                  enableButton.style.right = '20px';
                  enableButton.style.zIndex = '9999';
                  enableButton.style.padding = '10px 20px';
                  enableButton.style.backgroundColor = '#1e88e5';
                  enableButton.style.color = 'white';
                  enableButton.style.border = 'none';
                  enableButton.style.borderRadius = '4px';
                  enableButton.style.fontSize = '16px';
                  enableButton.style.cursor = 'pointer';
                  
                  enableButton.onclick = () => {
                    if (audioElementRef.current) {
                      audioElementRef.current.play()
                        .then(() => {
                          document.body.removeChild(enableButton);
                        })
                        .catch(e => console.error('Still failed to play after user click:', e));
                    }
                  };
                  
                  document.body.appendChild(enableButton);
                }
              });
          };
          
          // Try immediately, then retry after a short delay to ensure playback
          attemptPlayback();
          setTimeout(attemptPlayback, 500);
        } else {
          console.error('No audio element available to attach stream');
        }
      } else {
        console.warn('Received track event without streams');
      }
    };
    
    // Create a data channel for sending/receiving JSON messages
    const dataChannel = peerConnection.createDataChannel('oai-events', {
      ordered: true,
      maxRetransmits: 30  // Add retransmits for more reliability
    });
    
    // Monitor data channel state with improved error handling
    dataChannel.onopen = () => console.log('Data channel opened');
    dataChannel.onclose = () => console.log('Data channel closed');
    dataChannel.onerror = (event) => {
      console.error('Data channel error:', event);
      
      // Extract detailed error information if possible
      const errorEvent = event as unknown as { error?: { message?: string, errorDetail?: string, name?: string, code?: number } };
      
      if (errorEvent?.error) {
        const error = errorEvent.error;
        
        // Log detailed error information
        console.error('Data channel error details:', {
          message: error.message,
          name: error.name,
          code: error.code,
          detail: error.errorDetail
        });
        
        // Handle SCTP failures specifically
        if (error.errorDetail === 'sctp-failure' || 
            (error.message && error.message.includes('User-Initiated Abort'))) {
          console.warn('SCTP failure detected - this is often caused by browser restrictions or network issues');
          
          // These errors are often transient - we'll let the main error handler decide on reconnection
        }
      }
    };
    
    try {
      // Request microphone permissions first
      await requestMicrophonePermission();
      
      // Get user's microphone audio with optimal settings
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000  // Higher sample rate for better quality
        } 
      });
      
      // Add the audio track to the peer connection
      mediaStream.getAudioTracks().forEach(track => {
        console.log('Adding audio track to peer connection');
        peerConnection.addTrack(track, mediaStream);
      });
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw new Error('Microphone access failed: ' + (error instanceof Error ? error.message : String(error)));
    }
    
    // Add specific SCTP failure handling
    peerConnection.addEventListener('connectionstatechange', () => {
      console.log(`Connection state changed: ${peerConnection.connectionState}`);
      
      if (peerConnection.connectionState === 'failed') {
        console.warn('WebRTC connection failed - SCTP failure may have occurred');
        // The connection will be cleaned up by the calling code
      }
    });
    
    // Create an SDP offer
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false
    });
    
    await peerConnection.setLocalDescription(offer);
    
    // Wait for ICE gathering to complete or timeout
    await waitForIceGathering(peerConnection);
    
    if (!peerConnection.localDescription?.sdp) {
      throw new Error('Failed to create local description');
    }
    
    console.log('Sending SDP offer to OpenAI Realtime API');
    
    // Send the SDP offer to OpenAI's Realtime API
    const response = await fetch('https://api.openai.com/v1/realtime', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
      body: peerConnection.localDescription.sdp,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to establish Realtime connection: ${errorText}`);
    }
    
    // Get the SDP answer from OpenAI
    const answerSdp = await response.text();
    
    console.log('Received SDP answer from OpenAI');
    
    // Set the remote description with the SDP answer
    await peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: answerSdp,
    });
    
    // Wait for connection establishment
    await waitForIceConnection(peerConnection);
    
    console.log('WebRTC connection established successfully');
    
    return { peerConnection, dataChannel };
  } catch (error) {
    console.error('Failed to create Realtime connection:', error);
    throw error;
  }
}

// Helper to request microphone permissions
async function requestMicrophonePermission(): Promise<void> {
  try {
    // Request permissions only
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop all tracks immediately - we just want the permission
    stream.getTracks().forEach(track => track.stop());
    console.log('Microphone permission granted');
  } catch (error) {
    console.error('Microphone permission denied:', error);
    throw new Error('Microphone permission denied. Please allow microphone access and try again.');
  }
}

// Helper to wait for ICE gathering
async function waitForIceGathering(peerConnection: RTCPeerConnection): Promise<void> {
  return new Promise<void>((resolve) => {
    if (peerConnection.iceGatheringState === 'complete') {
      resolve();
    } else {
      const checkState = () => {
        if (peerConnection.iceGatheringState === 'complete') {
          peerConnection.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      peerConnection.addEventListener('icegatheringstatechange', checkState);
      
      // Set a timeout in case ICE gathering takes too long
      setTimeout(() => {
        peerConnection.removeEventListener('icegatheringstatechange', checkState);
        console.log('ICE gathering timeout, proceeding with available candidates');
        resolve();
      }, 5000); // Increased timeout
    }
  });
}

// Helper to wait for ICE connection establishment
async function waitForIceConnection(peerConnection: RTCPeerConnection): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Set a timeout for connection establishment
    const timeout = setTimeout(() => {
      reject(new Error('WebRTC connection establishment timeout'));
    }, 15000); // Increased timeout
    
    const checkState = () => {
      if (['connected', 'completed'].includes(peerConnection.iceConnectionState)) {
        clearTimeout(timeout);
        peerConnection.removeEventListener('iceconnectionstatechange', checkState);
        resolve();
      } else if (['failed', 'disconnected', 'closed'].includes(peerConnection.iceConnectionState)) {
        clearTimeout(timeout);
        peerConnection.removeEventListener('iceconnectionstatechange', checkState);
        reject(new Error(`ICE connection failed: ${peerConnection.iceConnectionState}`));
      }
    };
    
    peerConnection.addEventListener('iceconnectionstatechange', checkState);
    checkState(); // Check initial state
  }).catch(error => {
    console.warn('Connection establishment warning:', error.message);
    // Continue anyway, as the connection might still work
  });
}

// Send a message to the OpenAI Realtime API through the data channel
export function sendRealtimeMessage(dataChannel: RTCDataChannel, message: any): boolean {
  if (dataChannel.readyState === 'open') {
    try {
      const messageString = JSON.stringify(message);
      dataChannel.send(messageString);
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  } else {
    console.error('Data channel not open, state:', dataChannel.readyState);
    return false;
  }
}

// Update the session with specific instructions and context
export function updateSession(
  dataChannel: RTCDataChannel, 
  instructions: string,
  isPushToTalk: boolean = false,
  context?: string
): boolean {
  console.log('Updating session with instructions:', instructions.substring(0, 50) + '...');
  console.log('Push to talk mode:', isPushToTalk);
  console.log('Context provided:', !!context);
  
  // Clear any existing audio buffer
  sendRealtimeMessage(dataChannel, { type: 'input_audio_buffer.clear' });
  
  // Configure turn detection based on push-to-talk setting
  const turnDetection = isPushToTalk
    ? null // No automatic turn detection for push-to-talk
    : {
        type: 'server_vad', // Voice Activity Detection
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 200,
        create_response: true,
      };
  
  // Build enhanced RAG instructions with context if available
  let fullInstructions = instructions;
  
  if (context) {
    // Format RAG instructions to be clear about using the document context
    fullInstructions = `
You are a helpful voice assistant with access to specific document content. 
Your primary responsibility is to answer questions based on the provided document.

When answering questions:
1. Prioritize information from the document content
2. Cite specific parts of the document when relevant
3. If the question can't be answered from the document, clearly state that and provide a general response
4. Keep responses concise and focused on the question

${instructions}

DOCUMENT CONTENT:
${context}

Remember to focus your answers on the document content above.
`;
  }
  
  // Truncate very long contexts to avoid issues
  const maxLength = 10000;
  const truncatedInstructions = fullInstructions.length > maxLength 
    ? fullInstructions.substring(0, maxLength) + '... [truncated]' 
    : fullInstructions;
  
  // Create the session update event with explicit high-quality audio settings
  const sessionUpdateEvent = {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      instructions: truncatedInstructions,
      voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
      response_format: { type: 'text_and_audio' }, // Critical for audio responses
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16', // Using PCM format for highest quality
      audio_sample_rate: 24000, // Higher sample rate for better quality
      audio_bit_depth: 16, // Standard bit depth
      input_audio_transcription: { model: 'whisper-1' },
      turn_detection: turnDetection,
    },
  };
  
  console.log('Sending session update event');
  const result = sendRealtimeMessage(dataChannel, sessionUpdateEvent);
  console.log('Session update sent:', result);
  
  return result;
} 