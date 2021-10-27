# Block Duplicate Work Items
This extension provides the ability to ***block*** duplicate work item creation, similarity between work items is currently determined based on [Dice's Coefficient](http://en.wikipedia.org/wiki/S%C3%B8rensen%E2%80%93Dice_coefficient).

Checks are automatically performed on work items of ***the same type|All types*** and on the following fields (configurable from the project's admin hub) :

- Title
- Description

As we are more intrested in the textual content before performing our similarity check we normalize our text:

1. Removing all HTML tags.
2. Removing the following punctuation **!"#$%&'()\*+,-./:;?@[\\]^_`{|}~**.
3. Convert to lowercase.

Similarity is established based on an index 0.0 - 1.0 :

- 0.0 being least similar
- 1.0 being most similar.

By default this extension leverages a default threshold of 0.80 for similarity index, this threshold is configurable from the project's admin hub.

This extension can be leveraged in combination with the [Find similar workitems](https://marketplace.visualstudio.com/items?itemName=tschmiedlechner.find-similar-workitems) extension to establish which work items are similar to the current item.