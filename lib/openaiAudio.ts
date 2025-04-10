/**
 * Utility functions for handling OpenAI audio responses
 */

/**
 * Extract audio data from an OpenAI response
 * @param responseData The raw response data from OpenAI
 * @returns The audio data if found, null otherwise
 */
export function extractAudioData(responseData: any): string | null {
  if (!responseData) return null;

  // Check directly in the root object
  if (responseData.audio) {
    return responseData.audio;
  }

  // Check in the item object
  if (responseData.item) {
    // Check directly in item
    if (responseData.item.audio) {
      return responseData.item.audio;
    }
    
    // Check in item.content array
    if (responseData.item.content && Array.isArray(responseData.item.content)) {
      for (const contentItem of responseData.item.content) {
        if (contentItem.type === 'audio' && contentItem.audio) {
          return contentItem.audio;
        }
      }
    }
  }

  return null;
}

/**
 * Extract transcript from an OpenAI response
 * @param responseData The raw response data from OpenAI
 * @returns The transcript if found, null otherwise
 */
export function extractTranscript(responseData: any): string | null {
  if (!responseData) return null;

  // Check directly in the root object
  if (responseData.transcript) {
    return responseData.transcript;
  }

  // Check in the item object
  if (responseData.item) {
    // Check directly in item
    if (responseData.item.transcript) {
      return responseData.item.transcript;
    }
    
    // Check in item.content array
    if (responseData.item.content && Array.isArray(responseData.item.content)) {
      for (const contentItem of responseData.item.content) {
        if (contentItem.type === 'audio' && contentItem.transcript) {
          return contentItem.transcript;
        }
      }
    }
  }

  return null;
}

/**
 * Play audio data in the browser
 * @param audioData Base64 encoded audio data
 * @param audioElement Audio element to use for playback
 * @param audioType Optional MIME type (defaults to 'audio/mp3')
 * @returns Promise that resolves when playback starts
 */
export async function playAudioData(
  audioData: string, 
  audioElement: HTMLAudioElement,
  audioType: string = 'audio/mp3'
): Promise<void> {
  try {
    // Handle different possible formats
    let binaryData: Uint8Array;
    
    // Check if the data is already a data URL (starts with "data:")
    if (audioData.startsWith('data:')) {
      // Extract base64 part from data URL
      const base64Data = audioData.split(',')[1];
      binaryData = Buffer.from(base64Data, 'base64');
    } else {
      // Assume it's raw base64
      binaryData = Buffer.from(audioData, 'base64');
    }
    
    // Create blob from binary data
    const audioBlob = new Blob([binaryData], { type: audioType });
    const audioUrl = URL.createObjectURL(audioBlob);
    
    // Set source and play
    audioElement.src = audioUrl;
    
    // Play the audio
    await audioElement.play();
    
    // Clean up the object URL when done
    audioElement.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };
  } catch (error) {
    console.error('Error playing audio:', error);
    throw error;
  }
}

/**
 * Check if a response is an OpenAI audio response
 * @param responseData The response data to check
 * @returns True if the response contains audio data or is likely an audio response
 */
export function isOpenAIAudioResponse(responseData: any): boolean {
  if (!responseData) {
    return false;
  }
  
  // Check for audio data first
  if (extractAudioData(responseData)) {
    return true;
  }
  
  // Even if no audio data, check if it's an output item with audio type
  if (responseData.type && responseData.type.includes('response.output_item')) {
    if (responseData.item?.content) {
      return responseData.item.content.some((item: any) => item.type === 'audio');
    }
  }
  
  return false;
} 