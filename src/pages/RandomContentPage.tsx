import { createSignal, onMount } from "solid-js";
import { resourceDir, join } from '@tauri-apps/api/path';
import { readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';

// These arrays will be populated later with actual content
const textArray: string[] = [
  "_up_/bundle/text/1.txt", "_up_/bundle/text/2.txt", "_up_/bundle/text/3.txt" 
];

const imageUrlArray: string[] = [
 "_up_/bundle/imgs/1.jfif", "_up_/bundle/imgs/2.jfif", "_up_/bundle/imgs/3.jpg"
];

export default function RandomContentPage() {
  const [selectedText, setSelectedText] = createSignal("");
  const [selectedImage, setSelectedImage] = createSignal("");

  onMount(async () => {
    // Select random text and image on component mount
    if (textArray.length > 0) {
      const randomText = textArray[Math.floor(Math.random() * textArray.length)];
      setSelectedText(await readTextFile(randomText, { baseDir: BaseDirectory.Resource }));
    }
    if (imageUrlArray.length > 0) {
      const randomImage = imageUrlArray[Math.floor(Math.random() * imageUrlArray.length)];
      const imgPath = await join(await resourceDir(), randomImage) 
      const imgUrl = convertFileSrc(imgPath);
      console.log("imgPath: " + imgPath)
      console.log("imgUrl: " + imgUrl)
      setSelectedImage(imgUrl);
    }
  });

  return (
    <div class="random-content-page">
      <p class="pretext">{selectedText()}</p>
      {selectedImage() && <img src={selectedImage()} alt="Random content" />}
      <button onClick={() => history.back()}>Go Back</button>
    </div>
  );
}

