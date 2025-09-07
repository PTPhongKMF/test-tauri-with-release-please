import { createSignal, onMount } from "solid-js";

// These arrays will be populated later with actual content
const textArray: string[] = [];
const imageUrlArray: string[] = [];

export default function RandomContentPage() {
  const [selectedText, setSelectedText] = createSignal("");
  const [selectedImage, setSelectedImage] = createSignal("");

  onMount(() => {
    // Select random text and image on component mount
    if (textArray.length > 0) {
      const randomText = textArray[Math.floor(Math.random() * textArray.length)];
      setSelectedText(randomText);
    }
    if (imageUrlArray.length > 0) {
      const randomImage = imageUrlArray[Math.floor(Math.random() * imageUrlArray.length)];
      setSelectedImage(randomImage);
    }
  });

  return (
    <div class="random-content-page">
      <pre>{selectedText()}</pre>
      {selectedImage() && <img src={selectedImage()} alt="Random content" />}
      <button onClick={() => history.back()}>Go Back</button>
    </div>
  );
}
