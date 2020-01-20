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

const PREDICTION_CLASSES = ['fake', 'satire', 'bias', 'conspiracy', 'state', 'junksci', 'hate', 'clickbait', 'unreliable', 'political', 'reliable', 'unknown', 'rumor'];

// Add a listener to hear from the content.js page when the image is through
// processing.  The message should contin an action, a url, and predictions (the
// output of the classifier)
//
// message: {action, url, predictions}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === 'TEXT_CLICK_PROCESSED' && message.content_info) {
    for (let i = 0; i < message.content_info['top_words'].length; i++) {
      let word = message.content_info['top_words'][i];
      let xpath_query = "//text()[contains(translate(., '" + word.toUpperCase() + "', '" + word + "'),'" + word + "')]/parent::*";
      console.log(xpath_query);
      word_query = document.evaluate(xpath_query, document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
      console.log("Found " + word_query.snapshotLength + " instances of word " + word);
      for (let j = 0; j < word_query.snapshotLength; j++) {
        if (word_query.snapshotItem(j).innerHTML != undefined) {
          console.log("Node has html content");
          let regex = new RegExp("(?:^|\\s+)" + word + "(?:\\s+|$)", "gi");
          let t = word_query.snapshotItem(j).innerHTML.replace(regex, '<span class="important-word-' + i + '">$&</span>');
          word_query.snapshotItem(j).innerHTML = t;
        }
      }

      let s = document.createElement('style');
      document.head.appendChild(s);
      s.type = 'text/css';
      s.appendChild(document.createTextNode('.important-word-' + i + ' { font-size: ' + (250 - (15 * i) + '% }')));
    }

    console.log(message.content_info);
    alert("Predicted class: " + PREDICTION_CLASSES[message.content_info['prediction']]);
  }
});
