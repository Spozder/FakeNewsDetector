/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import 'babel-polyfill';
import * as tf from '@tensorflow/tfjs';
//import {WORD_INDEXES} from './word_index_lookup';

// Where to load the model from.
//const MOBILENET_MODEL_TFHUB_URL = 'https://tfhub.dev/google/imagenet/mobilenet_v2_100_224/classification/2'
const FAKE_NEWS_MODEL_URL = "https://datavisfinalprojectstorage.s3.us-east-2.amazonaws.com/model3/model.json";
// TODO: Make model locally available witha  file:// path
// Number of words expected by model
const NUM_WORDS = 150;

const FIVE_SECONDS_IN_MS = 5000;
/**
 * What action to take when someone clicks the right-click menu option on a text selection.
 *  Listener calls this function with info containing the selectionText attribute.
 *  Asks the classifier to classify the selected text!
 */
function clickMenuCallback(info, tab) {
  console.log("Trying to classify text");
  textClassifier.classifyText(info.selectionText, tab.id);
}

/**
 * Adds a right-click menu option to trigger classifying the text.
 * The menu option should only appear when right-clicking a selection.
 */
chrome.contextMenus.create({
  title: 'Classify News Text',
  contexts: ['selection'],
  onclick: clickMenuCallback
});

/**
 * Async loads given model on construction.  Subsequently handles
 * requests to classify text through the .classifyText API.
 * Successful requests will post a chrome message with
 * 'TEXT_CLICK_PROCESSED' action, which the content.js can
 * hear and use to manipulate the DOM.
 */
class TextClassifier {
  constructor() {
    this.loadWordIndex();
    this.loadModel();
  }

  async loadWordIndex() {
    let response = await fetch(chrome.runtime.getURL("data/old_word_index_lookup.json"));
    this.word_indexes = await response.json();
  }

  /**
   * Loads model from URL and keeps a reference to it in the object.
   */
  async loadModel() {
    console.log('Loading model...');
    const startTime = performance.now();
    try {
      this.model = await tf.loadLayersModel(FAKE_NEWS_MODEL_URL, {fromTFHub: false});
      // Warms up the model by causing intermediate tensor values
      // to be built and pushed to GPU.
      tf.tidy(() => {
        this.model.predict(tf.zeros([1, NUM_WORDS]));
      });
      const totalTime = Math.floor(performance.now() - startTime);
      console.log(`Model loaded and initialized in ${totalTime} ms...`);

      /**
       * Consider adding stuff to do actual CAM....
       * https://github.com/tensorflow/tfjs-examples/blob/master/visualize-convnet/cam.js#L49
       * let conv_layers = this.model.layers.filter((layer) => layer.getClassName().startsWith('Conv'));
       * this.activation_map_objects = [];
       * for (c_layer in conv_layers) {
       * let info_object = {};
       * info_object[]
       * }
      **/
    } catch(err) {
      console.error(
          `Unable to load model from URL: ${FAKE_NEWS_MODEL_URL}\n error: ${err}`);
    }
  }

  /**
   * Triggers the model to make a prediction on the text provided.
   * After a successful prediction a TEXT_CLICK_PROCESSED message when
   * complete, for the content.js script to hear and update the DOM with the
   * results of the prediction.
   *
   * @param {string} text  text to classify
   * @param {number} tabId which tab the request comes from.
   */
  async classifyText(text, tabId) {
    if (!tabId) {
      console.error('No tab.  No prediction.');
      return;
    }
    if (!this.model) {
      console.log('Waiting for model to load...');
      return;
    }
    let message;
    let filtered_and_cleaned = this.clean_text(text);
    let numerical_values = this.tokenize(filtered_and_cleaned);
    let prediction = await this.predict(numerical_values);
    let top_words = prediction['top_words'].map((i) => filtered_and_cleaned[i]);
    console.log(top_words);
    message = {
      action: 'TEXT_CLICK_PROCESSED',
      content_info: {
        'prediction': prediction['predicted_index'],
        'top_words': top_words
      }
    };
    chrome.tabs.sendMessage(tabId, message);
  }

  clean_text(text) {
    let split_on_whitespace = text.match(/\S+/g) || [];

    return split_on_whitespace.map((word) => word.toLowerCase()).filter((word) => word in this.word_indexes);
  }


  /**
   * Takes a string to classify, produces the tf tensor representation
   * for classification
   * @param {string} text Text to classify
   */
  tokenize(text) {
    let mapped_to_integers = text.map((word) => this.word_indexes[word]);
    
    if (mapped_to_integers.length === 0) {
      console.log("Text to classify is empty - something is probably wrong...");
    }

    if (mapped_to_integers.length > NUM_WORDS) {
      mapped_to_integers = mapped_to_integers.slice(0, NUM_WORDS);
    } else {
      mapped_to_integers = mapped_to_integers.concat(Array(NUM_WORDS - mapped_to_integers.length).fill(0));
    }

    return mapped_to_integers;
  }

  /**
   * Executes the model on the input numerical text tensor - returns predicted class.
   * @param {[integer]} numerical_values Tensor containing the values to classify
   */
  async predict(numerical_values) {
    console.log('Predicting...');
    let t = tf.tensor2d([numerical_values]);
    const startTime = performance.now();
    const logits = tf.tidy(() => {
      return this.model.predict(t);
    });

    // TODO: Figure out convolution layer activations
    // const classes = await this.getTopKClasses(logits, TOPK_PREDICTIONS);
    const totalTime = performance.now() - startTime;
    console.log(`Done in ${totalTime.toFixed(1)} ms `);
    console.log("Prediction: " + logits);

    const startTime2 = performance.now();
    const norm_list = tf.tidy(() => {
       // Sliding window CAM!
       let norm_list = [];
       for (let i = 0; i < numerical_values.length; i++) {
         let values_without_index = Array.from(numerical_values);
         values_without_index[i] = 0;
         let logits_without_index = this.model.predict(tf.tensor2d([values_without_index]));
         norm_list.push(tf.norm(tf.sub(logits.flatten(), logits_without_index.flatten())).dataSync()[0]);
       }
       return norm_list;
    });
    const totalTime2 = performance.now() - startTime2;
    console.log(`Sliding Window CAM done in ${totalTime2.toFixed(1)} ms`);
    console.log(norm_list);
    let top_words = tf.topk(norm_list, 8, true)['indices'].arraySync()
    console.log(top_words);

    return {'predicted_index': tf.argMax(logits).dataSync()[0], 'top_words': top_words};
  }
}

const textClassifier = new TextClassifier();