import { useState, useRef, useEffect, useCallback } from 'react';
import { Message } from '@/types/message';
import { createRealtimeConnection, sendRealtimeMessage, updateSession } from '../realtimeConnection';

export interface RealtimeVoiceState {
  isConnected: boolean;
  isConnecting: boolean;
  isVoiceMode: boolean;
  isRecording: boolean;
  error: string | null;
  isManuallyDisconnected: boolean;
  connectionAttempts?: number;
}

export interface RealtimeVoiceCallbacks {
  onMessage: (message: string, messageType?: string) => void;
  onError: (error: string) => void;
  onStatusChange: (isConnected: boolean) => void;
}

export interface RealtimeVoiceProps {
  documentId?: string;
}

export function useRealtimeVoice(callbacks: RealtimeVoiceCallbacks, props?: RealtimeVoiceProps) {
  // Connection state
  const [state, setState] = useState<RealtimeVoiceState>({
    isConnected: false,
    isConnecting: false,
    isVoiceMode: false,
    isRecording: false,
    error: null,
    isManuallyDisconnected: false
  });

  // References to WebRTC objects
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Document context for RAG integration
  const [documentContext, setDocumentContext] = useState<string | null>(null);
  const documentIdRef = useRef<string | undefined>(props?.documentId);
  
  // Track page visibility to manage connection
  const [isPageVisible, setIsPageVisible] = useState<boolean>(true);

  // Update documentId if it changes
  useEffect(() => {
    documentIdRef.current = props?.documentId;
  }, [props?.documentId]);

  // Helper to update state
  const updateState = useCallback((newState: Partial<RealtimeVoiceState>) => {
    setState(prevState => ({ ...prevState, ...newState }));
  }, []);

  // Function to clean up connections without state updates
  const cleanupConnections = useCallback(() => {
    // Close and clean up the peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.getSenders().forEach(sender => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Clean up the media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // Track audio elements and make sure they're properly configured
  useEffect(() => {
    // Create audio element if it doesn't exist
    if (!audioElementRef.current) {
      console.log('Creating new audio element for realtime voice');
      const audio = new Audio();
      audio.autoplay = true;
      audio.controls = false;
      audio.volume = 1.0;
      audio.muted = false;
      
      // Add to page but hide it
      audio.style.display = 'none';
      document.body.appendChild(audio);
      
      // Keep reference
      audioElementRef.current = audio;
    }
    
    // Ensure proper configuration
    if (audioElementRef.current) {
      // Configure for optimal playback
      audioElementRef.current.autoplay = true;
      audioElementRef.current.muted = false;
      audioElementRef.current.volume = 1.0;
      
      // Handle play errors
      audioElementRef.current.onplay = () => {
        console.log('✅ Audio element is playing');
      };
      
      audioElementRef.current.onerror = (e) => {
        console.error('❌ Audio playback error:', e);
        createPlaybackFixButton();
      };
    }
    
    // Cleanup
    return () => {
      if (audioElementRef.current && document.body.contains(audioElementRef.current)) {
        document.body.removeChild(audioElementRef.current);
      }
    };
  }, []);

  // Function to create a button to fix audio playback issues
  const createPlaybackFixButton = useCallback(() => {
    // Remove any existing buttons first
    const existingButtons = document.querySelectorAll('[data-audio-play-button="true"]');
    existingButtons.forEach(button => {
      if (document.body.contains(button)) {
        document.body.removeChild(button);
      }
    });
    
    // Create a more prominent button
    const playButton = document.createElement('button');
    playButton.innerHTML = '🎧 <b>Enable Voice</b><br>Click to hear responses';
    playButton.style.position = 'fixed';
    playButton.style.bottom = '20px';
    playButton.style.right = '20px';
    playButton.style.padding = '15px 25px';
    playButton.style.backgroundColor = '#ff9800';
    playButton.style.color = 'white';
    playButton.style.border = 'none';
    playButton.style.borderRadius = '8px';
    playButton.style.fontSize = '16px';
    playButton.style.fontFamily = 'Arial, sans-serif';
    playButton.style.cursor = 'pointer';
    playButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    playButton.style.zIndex = '99999';
    
    // Add hover effect
    playButton.onmouseover = () => {
      playButton.style.backgroundColor = '#f57c00';
    };
    playButton.onmouseout = () => {
      playButton.style.backgroundColor = '#ff9800';
    };
    
    playButton.onclick = () => {
      // Try to play audio when clicked
      if (audioElementRef.current) {
        // Create a short silent audio to trigger playback permissions
        const silentContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const silentOsc = silentContext.createOscillator();
        const silentDest = silentContext.createMediaStreamDestination();
        silentOsc.connect(silentDest);
        silentOsc.start();
        silentOsc.stop(0.1);
        
        // Set to this stream first
        audioElementRef.current.srcObject = silentDest.stream;
        
        audioElementRef.current.play()
          .then(() => {
            console.log('✅ Audio playing after button click');
            // Show success message
            playButton.innerHTML = '✅ Voice Enabled!';
            playButton.style.backgroundColor = '#4CAF50';
            
            // Reset srcObject for subsequent audio
            audioElementRef.current!.srcObject = null;
            
            // Remove after 2 seconds
            setTimeout(() => {
              if (document.body.contains(playButton)) {
                document.body.removeChild(playButton);
              }
            }, 2000);
          })
          .catch(e => {
            console.error('❌ Still failed after button click:', e);
            playButton.innerHTML = '❌ Failed - Check Browser Settings';
            playButton.style.backgroundColor = '#f44336';
          });
      }
    };
    
    playButton.dataset.audioPlayButton = 'true';
    document.body.appendChild(playButton);
  }, []);
  
  // Define track handler function - simplified approach like the OpenAI Realtime Agents repo
  const handleTrackEvent = useCallback((event: RTCTrackEvent) => {
    console.log('AUDIO TRACK RECEIVED', event);
    
    // Get the stream
    if (!event.streams || event.streams.length === 0) {
      console.error('❌ No streams in track event');
      return;
    }
    
    const stream = event.streams[0];
    console.log('✅ RECEIVING AUDIO STREAM:', stream.id);
    
    // Debug the audio tracks
    const audioTracks = stream.getAudioTracks();
    console.log(`Found ${audioTracks.length} audio tracks:`, 
      audioTracks.map(t => ({enabled: t.enabled, muted: t.muted, id: t.id, label: t.label})));
    
    // Ensure our audio element exists
    if (!audioElementRef.current) {
      console.error('❌ Audio element not available, creating one');
      const audioEl = document.createElement('audio');
      audioEl.id = 'openai-audio-element';
      audioEl.autoplay = true;
      audioEl.controls = true; // For debugging
      audioEl.style.width = '300px';
      audioEl.style.display = 'block';
      document.body.appendChild(audioEl);
      audioElementRef.current = audioEl;
    }
    
    // Set the srcObject directly
    if (audioElementRef.current) {
      console.log('🔊 Setting stream to audio element');
      
      // First unset any existing srcObject
      if (audioElementRef.current.srcObject) {
        audioElementRef.current.srcObject = null;
      }
      
      // Set the new stream
      audioElementRef.current.srcObject = stream;
      audioElementRef.current.muted = false;
      audioElementRef.current.volume = 1.0;
      
      // Critical step: force the browser to notice the new srcObject
      audioElementRef.current.load();
      
      // Play with a visible user feedback and extensive error handling
      const attemptPlay = () => {
        console.log('🎬 Attempting to play audio...');
        
        if (!audioElementRef.current) return;
        
        // Check if the stream is active before playing
        if (stream.active) {
          const playPromise = audioElementRef.current.play();
          
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log('✅ AUDIO PLAYBACK STARTED');
                
                // Create a floating notification
                const notification = document.createElement('div');
                notification.textContent = '🔊 Audio Playback Started';
                notification.style.position = 'fixed';
                notification.style.bottom = '60px';
                notification.style.right = '10px';
                notification.style.backgroundColor = '#4CAF50';
                notification.style.color = 'white';
                notification.style.padding = '10px';
                notification.style.borderRadius = '5px';
                notification.style.zIndex = '10000';
                document.body.appendChild(notification);
                
                // Remove after 3 seconds
                setTimeout(() => {
                  if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                  }
                }, 3000);
              })
              .catch(error => {
                console.error('❌ Audio playback failed:', error);
                
                // Create a visual indicator that autoplay was blocked
                const playButton = document.createElement('button');
                playButton.textContent = '🔊 Click to Play Audio';
                playButton.style.position = 'fixed';
                playButton.style.top = '50%';
                playButton.style.left = '50%';
                playButton.style.transform = 'translate(-50%, -50%)';
                playButton.style.padding = '20px';
                playButton.style.backgroundColor = '#f44336';
                playButton.style.color = 'white';
                playButton.style.border = 'none';
                playButton.style.borderRadius = '5px';
                playButton.style.fontSize = '18px';
                playButton.style.cursor = 'pointer';
                playButton.style.zIndex = '10000';
                
                playButton.onclick = () => {
                  if (audioElementRef.current) {
                    audioElementRef.current.play()
                      .then(() => console.log('✅ Audio playback started after click'))
                      .catch(e => console.error('❌ Still failed after click:', e));
                  }
                  document.body.removeChild(playButton);
                };
                
                // Remove any existing buttons first
                const existingButtons = document.querySelectorAll('[data-audio-play-button="true"]');
                existingButtons.forEach(button => button.remove());
                
                playButton.dataset.audioPlayButton = 'true';
                document.body.appendChild(playButton);
              });
          }
        } else {
          console.warn('⚠️ Stream is not active, cannot play');
        }
      };
      
      // Attempt to play immediately
      attemptPlay();
      
      // Also set up listeners for when the audio element state changes
      audioElementRef.current.onplay = () => console.log('🎵 Audio element play event fired');
      audioElementRef.current.onplaying = () => console.log('🎵 Audio element playing event fired');
      audioElementRef.current.onpause = () => console.log('⏸️ Audio element paused');
      audioElementRef.current.onended = () => console.log('🏁 Audio element playback ended');
      audioElementRef.current.onerror = (e) => console.error('❌ Audio element error:', e);
      
      // Attempt to reconnect and play on click anywhere on the page
      const pageClickHandler = () => {
        if (audioElementRef.current && !audioElementRef.current.paused) {
          console.log('Page clicked, ensuring audio is playing');
          attemptPlay();
        }
      };
      
      // Add and then remove to avoid multiple handlers
      document.removeEventListener('click', pageClickHandler);
      document.addEventListener('click', pageClickHandler);
    } else {
      console.error('❌ No audio element reference available');
    }
  }, []);

  // Fetch ephemeral key from server
  const fetchEphemeralKey = async (): Promise<string | null> => {
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      
      // Create a session with the server
      const response = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ documentId: documentIdRef.current })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create session');
      }

      const sessionData = await response.json();
      const ephemeralKey = sessionData.client_secret?.value;
      
      if (!ephemeralKey) {
        throw new Error('No ephemeral key provided');
      }

      return ephemeralKey;
    } catch (error) {
      console.error('Error fetching ephemeral key:', error);
      callbacks.onError(error instanceof Error ? error.message : 'Failed to get ephemeral key');
      return null;
    }
  };

  // Enhanced connection function
  const connect = useCallback(async () => {
    if (state.isConnecting || state.isConnected) {
      console.log('Already connecting or connected, ignoring connect call');
      return;
    }
    
    // Clean up any existing connections
    cleanupConnections();
    
    // Mark as connecting
    updateState({ 
      isConnecting: true, 
      isManuallyDisconnected: false,
      error: null 
    });
    callbacks.onStatusChange(false);
    
    try {
      // Get ephemeral key
      const key = await fetchEphemeralKey();
      if (!key) {
        throw new Error('Failed to get ephemeral key');
      }
      
      // Create WebRTC connection
      console.log('Establishing WebRTC connection...');
      const { peerConnection, dataChannel } = await createRealtimeConnection(
        key, 
        audioElementRef as React.RefObject<HTMLAudioElement>
      );
      
      // Store references
      peerConnectionRef.current = peerConnection;
      dataChannelRef.current = dataChannel;
      
      // Mark as connected
      updateState({ 
        isConnecting: false,
        isConnected: true
      });
      callbacks.onStatusChange(true);
      
      // Attach message handler
      dataChannel.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Log all messages for debugging with a clear visual indicator
          console.log('%c📩 RECEIVED MESSAGE:', 'background: #2196F3; color: white; padding: 5px; border-radius: 5px;', data);
          
          // Handle different message types
          if (data.type === 'assistant_message') {
            // This is the text transcript
            callbacks.onMessage(data.content);
          } else if (data.type === 'error') {
            console.error('📛 ERROR FROM API:', data.message || 'Unknown error');
            callbacks.onError(data.message || 'Unknown error');
          } else if (data.type === 'conversation.item.create' && data.item?.type === 'user_input_transcription') {
            // This is the user's voice input transcription
            if (data.item.content && data.item.content[0] && data.item.content[0].text) {
              // Log the transcription for debugging
              console.log('🎤 TRANSCRIPTION:', data.item.content[0].text);
              
              // For RAG integration, we could send this to our backend for document search
              // This is handled by the OpenAI API when context is set, but we could 
              // add custom handling here if needed
            }
          } else if (data.type.startsWith('response.output')) {
            // Handle all response output types
            console.log('🎬 RESPONSE OUTPUT RECEIVED:', data);
            
            // Extract any audio content
            let audioContent = null;
            
            if (data.type === 'response.output_item.done') {
              const responseItem = data.item;
              if (responseItem && responseItem.type === 'message' && responseItem.content) {
                // Find and extract audio content
                const audioItems = responseItem.content.filter((c: {type: string}) => c.type === 'audio');
                if (audioItems.length > 0) {
                  audioContent = audioItems[0];
                  console.log('🔊 AUDIO CONTENT FOUND:', audioContent);
                  
                  // Extract the transcript text if available
                  const transcriptItems = responseItem.content.filter((c: {type: string}) => c.type === 'text');
                  if (transcriptItems.length > 0) {
                    console.log('📝 Transcript:', transcriptItems[0].text);
                    
                    // Send the transcript text to the callback for display in the UI
                    // This is the RAG response from the model that includes document context
                    callbacks.onMessage(transcriptItems[0].text);
                    
                    // Add visual indicator that this is a RAG response from document
                    if (documentContext) {
                      callbacks.onMessage('(Response based on your document)', 'rag-indicator');
                    }
                  }
                  
                  // Create a notification that audio is being played
                  const notification = document.createElement('div');
                  notification.textContent = '🔊 Voice Response: ' + 
                    (transcriptItems.length > 0 ? 
                      (transcriptItems[0].text.length > 30 ? 
                        transcriptItems[0].text.substring(0, 30) + '...' : 
                        transcriptItems[0].text) : 
                      'Playing...');
                  notification.style.position = 'fixed';
                  notification.style.top = '10px';
                  notification.style.left = '10px';
                  notification.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                  notification.style.color = 'white';
                  notification.style.padding = '10px';
                  notification.style.borderRadius = '5px';
                  notification.style.zIndex = '10000';
                  notification.style.maxWidth = '300px';
                  document.body.appendChild(notification);
                  
                  // Remove after 5 seconds
                  setTimeout(() => {
                    if (document.body.contains(notification)) {
                      document.body.removeChild(notification);
                    }
                  }, 5000);
                }
              }
            }
            
            // Make sure audio is playing if we have an audio element
            if (audioElementRef.current) {
              // Try forcing playback
              const forcePlay = () => {
                if (!audioElementRef.current) return;
                
                console.log('🔄 Forcing audio playback check...');
                audioElementRef.current.muted = false;
                audioElementRef.current.volume = 1.0;
                
                const playPromise = audioElementRef.current.play();
                if (playPromise !== undefined) {
                  playPromise
                    .then(() => console.log('✅ Audio playback confirmed after message'))
                    .catch(error => {
                      console.error('❌ Audio still not playing after message:', error);
                      
                      // Create a more prominent button
                      const playButton = document.createElement('button');
                      playButton.innerHTML = '🎧 <b>Enable Voice</b><br>Click to hear responses';
                      playButton.style.position = 'fixed';
                      playButton.style.bottom = '20px';
                      playButton.style.right = '20px';
                      playButton.style.padding = '15px 25px';
                      playButton.style.backgroundColor = '#ff9800';
                      playButton.style.color = 'white';
                      playButton.style.border = 'none';
                      playButton.style.borderRadius = '8px';
                      playButton.style.fontSize = '16px';
                      playButton.style.fontFamily = 'Arial, sans-serif';
                      playButton.style.cursor = 'pointer';
                      playButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                      playButton.style.zIndex = '99999';
                      
                      // Add hover effect
                      playButton.onmouseover = () => {
                        playButton.style.backgroundColor = '#f57c00';
                      };
                      playButton.onmouseout = () => {
                        playButton.style.backgroundColor = '#ff9800';
                      };
                      
                      playButton.onclick = () => {
                        // Try to play audio when clicked
                        if (audioElementRef.current) {
                          audioElementRef.current.play()
                            .then(() => {
                              console.log('✅ Audio playing after button click');
                              // Show success message
                              playButton.innerHTML = '✅ Voice Enabled!';
                              playButton.style.backgroundColor = '#4CAF50';
                              
                              // Remove after 2 seconds
                              setTimeout(() => {
                                if (document.body.contains(playButton)) {
                                  document.body.removeChild(playButton);
                                }
                              }, 2000);
                            })
                            .catch(e => {
                              console.error('❌ Still failed after button click:', e);
                              playButton.innerHTML = '❌ Failed - Check Browser Settings';
                              playButton.style.backgroundColor = '#f44336';
                            });
                        }
                      };
                      
                      // Remove any existing buttons first
                      const existingButtons = document.querySelectorAll('[data-audio-play-button="true"]');
                      existingButtons.forEach(button => {
                        if (document.body.contains(button)) {
                          document.body.removeChild(button);
                        }
                      });
                      
                      playButton.dataset.audioPlayButton = 'true';
                      document.body.appendChild(playButton);
                    });
                }
              };
              
              // Attempt immediately, then retry after a short delay
              forcePlay();
              setTimeout(forcePlay, 500);
            }
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      // Handle ICE connection state changes for reconnection
      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        
        if (['disconnected', 'failed', 'closed'].includes(peerConnection.iceConnectionState)) {
          if (!state.isManuallyDisconnected) {
            console.log('ICE connection lost, will attempt reconnect');
            updateState({ isConnected: false });
            callbacks.onStatusChange(false);
            attemptReconnect();
          }
        }
      };
      
      // Monitor connection state for SCTP failures
      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state changed:', peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'failed') {
          console.warn('WebRTC connection failed - this may be due to an SCTP failure');
          
          if (!state.isManuallyDisconnected) {
            // Create a visible notification for users
            const notification = document.createElement('div');
            notification.textContent = '🔄 Connection failed. Attempting to reconnect...';
            notification.style.position = 'fixed';
            notification.style.top = '50%';
            notification.style.left = '50%';
            notification.style.transform = 'translate(-50%, -50%)';
            notification.style.backgroundColor = 'rgba(244, 67, 54, 0.9)';
            notification.style.color = 'white';
            notification.style.padding = '20px';
            notification.style.borderRadius = '8px';
            notification.style.zIndex = '10000';
            notification.style.textAlign = 'center';
            notification.style.maxWidth = '80%';
            notification.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
            notification.style.fontSize = '16px';
            document.body.appendChild(notification);
            
            // Remove after 5 seconds
            setTimeout(() => {
              if (document.body.contains(notification)) {
                document.body.removeChild(notification);
              }
            }, 5000);
            
            // Force an immediate reconnection
            updateState({ isConnected: false });
            callbacks.onStatusChange(false);
            // Force reconnect with highest priority
            setTimeout(() => attemptReconnect(true), 500);
          }
        }
      };

    } catch (error) {
      console.error('Connection error:', error);
      updateState({
        isConnecting: false,
        isConnected: false,
        error: error instanceof Error ? error.message : 'Failed to connect'
      });
      callbacks.onError(error instanceof Error ? error.message : 'Failed to connect');
      
      // Attempt to reconnect if it was a connection error
      if (!state.isManuallyDisconnected) {
        attemptReconnect();
      }
    }
  }, [state.isConnecting, state.isConnected, state.isManuallyDisconnected, updateState, callbacks, documentContext, cleanupConnections, documentIdRef]);

  // Track page visibility - moved after connect is defined
  useEffect(() => {
    // Function to handle visibility change
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      setIsPageVisible(isVisible);
      
      // Reconnect if becoming visible and was previously connected
      if (isVisible && !state.isConnected && !state.isConnecting && state.isManuallyDisconnected === false) {
        console.log('Page became visible, attempting to reconnect WebRTC');
        connect();
      }
    };

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Clean up
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.isConnected, state.isConnecting, state.isManuallyDisconnected, connect]);

  // Disconnect from the Realtime API
  const disconnect = useCallback(() => {
    updateState({ 
      isManuallyDisconnected: true,
      isConnected: false,
      isConnecting: false
    });
    cleanupConnections();
    callbacks.onStatusChange(false);
  }, [cleanupConnections, updateState, callbacks]);

  // Attempt to reconnect with exponential backoff
  const attemptReconnect = useCallback((forceReconnect: boolean = false) => {
    if ((state.isConnecting || state.isManuallyDisconnected) && !forceReconnect) return;
    
    // Don't attempt reconnection if page is not visible, unless forced
    if (!isPageVisible && !forceReconnect) {
      console.log('Page not visible, skipping reconnection attempt');
      return;
    }
    
    const maxAttempts = 5;
    const currentAttempts = state.connectionAttempts || 0;
    
    if (currentAttempts >= maxAttempts && !forceReconnect) {
      console.log(`Max reconnection attempts (${maxAttempts}) reached, giving up`);
      updateState({ 
        connectionAttempts: 0,
        error: 'Failed to reconnect after multiple attempts'
      });
      return;
    }
    
    // Reset connection attempts if this is a forced reconnect
    const attemptsToUse = forceReconnect ? 0 : currentAttempts;
    
    // Use shorter delays for initial attempts, longer for later ones
    const baseDelay = forceReconnect ? 500 : 1000;
    const delay = Math.min(baseDelay * Math.pow(1.5, attemptsToUse), 30000);
    console.log(`Attempting reconnect in ${delay}ms (attempt ${attemptsToUse + 1}/${maxAttempts}${forceReconnect ? ', forced' : ''})`);
    
    updateState({ connectionAttempts: forceReconnect ? 1 : currentAttempts + 1 });
    
    // Clean up any existing connections first to ensure a fresh start
    if (forceReconnect) {
      cleanupConnections();
    }
    
    setTimeout(() => {
      if ((!state.isConnected && !state.isConnecting && !state.isManuallyDisconnected) || forceReconnect) {
        console.log(`Reconnection attempt ${attemptsToUse + 1}/${maxAttempts}${forceReconnect ? ', forced' : ''}`);
        // Clean up and reset state before connecting
        cleanupConnections();
        updateState({ 
          isConnected: false,
          isConnecting: false,
          error: null
        });
        
        // Slight delay to ensure cleanup completes
        setTimeout(() => {
          connect();
        }, 100);
      }
    }, delay);
  }, [state.isConnecting, state.isConnected, state.connectionAttempts, state.isManuallyDisconnected, cleanupConnections, updateState, connect, isPageVisible]);

  // Toggle voice mode
  const toggleVoiceMode = useCallback(() => {
    updateState({ isVoiceMode: !state.isVoiceMode });
    
    // If turning off voice mode while recording, stop recording
    if (state.isVoiceMode && state.isRecording) {
      stopRecording();
    }
  }, [state.isVoiceMode, state.isRecording, updateState]);

  // Start recording (sending audio to OpenAI)
  const startRecording = useCallback(async () => {
    if (!state.isConnected) {
      console.error('Cannot start recording: not connected to server');
      callbacks.onError('Cannot start recording: not connected');
      return;
    }

    if (state.isRecording) {
      console.log('Already recording, ignoring start request');
      return;
    }

    try {
      console.log('Requesting microphone access...');
      
      // Request microphone access with specific constraints for better compatibility
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (!stream) {
        throw new Error('Failed to get audio stream, stream is null');
      }
      
      // Verify we have audio tracks
      const audioTracks = stream.getAudioTracks();
      console.log(`Got ${audioTracks.length} audio tracks`, audioTracks.map(t => t.label));
      
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks available in the stream');
      }
      
      // Store the stream
      mediaStreamRef.current = stream;
      
      // Update state
      updateState({ isRecording: true, error: null });
      console.log('Recording started successfully');
      
      // Check data channel
      if (!dataChannelRef.current) {
        throw new Error('Data channel is not available');
      }
      
      if (dataChannelRef.current.readyState !== 'open') {
        throw new Error(`Data channel is not open, current state: ${dataChannelRef.current.readyState}`);
      }
      
      // Send message to start recording
      console.log('Starting audio recording session...');
      sendRealtimeMessage(dataChannelRef.current, {
        type: 'input_audio_buffer.clear',
      });
      console.log('Audio buffer cleared, ready for recording');
      
      // Add track to peer connection if we haven't already
      try {
        const sender = peerConnectionRef.current?.getSenders().find(s => s.track?.kind === 'audio');
        
        if (!sender && peerConnectionRef.current) {
          console.log('Adding audio track to peer connection');
          const audioTrack = audioTracks[0];
          peerConnectionRef.current.addTrack(audioTrack, stream);
        } else {
          console.log('Audio sender already exists', sender);
        }
      } catch (trackError) {
        console.error('Error adding track to peer connection:', trackError);
        // Continue anyway, as some implementations might not need this
      }
      
    } catch (error) {
      // Provide detailed error information
      console.error('Error starting recording:', error);
      
      let errorMessage = 'Failed to access microphone';
      
      if (error instanceof Error) {
        errorMessage = `Microphone error: ${error.name} - ${error.message}`;
        
        // Special handling for common errors
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings.';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please connect a microphone and try again.';
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Microphone is in use by another application. Please close other apps using the microphone.';
        }
      }
      
      updateState({ 
        isRecording: false, 
        error: errorMessage 
      });
      callbacks.onError(errorMessage);
      
      // Clean up any partial stream that might have been created
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
    }
  }, [state.isConnected, state.isRecording, updateState, callbacks]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (!state.isRecording) return;

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Update state
    updateState({ isRecording: false });
    
    // Send message to stop recording and commit the buffer
    if (dataChannelRef.current) {
      sendRealtimeMessage(dataChannelRef.current, {
        type: 'input_audio_buffer.commit',
      });
      
      // Create a response after committing the audio buffer
      sendRealtimeMessage(dataChannelRef.current, {
        type: 'response.create',
      });
    }
  }, [state.isRecording, updateState]);

  // Set document context for RAG
  const setContext = useCallback((context: string) => {
    setDocumentContext(context);
    
    // If already connected, update the session with the new context
    if (state.isConnected && dataChannelRef.current) {
      const defaultInstructions = 'You are a helpful voice assistant. Answer questions based on the provided document context.';
      updateSession(dataChannelRef.current, defaultInstructions, !state.isVoiceMode, context);
    }
  }, [state.isConnected, state.isVoiceMode]);

  // Handle window unload events to properly close connection
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Clean up the connection gracefully when navigating away
      console.log('Page unloading, closing WebRTC connection gracefully');
      cleanupConnections();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [cleanupConnections]);

  return {
    state,
    connect,
    disconnect,
    toggleVoiceMode,
    startRecording,
    stopRecording,
    setContext
  };
} 