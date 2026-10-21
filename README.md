# Chat images — an Agents Hub plugin

Images the agent brings (paths in a reply, files sent to the chat) show right in the feed:

- one or two small images appear as they are, at natural size (not wider than the feed);
- a big image (larger than 1000×750) or three or more in one message appear as small previews in a row;
- a click on an image opens the hub lightbox: dimming, paging through the message's images (← →, swipe), Esc to close;
- the lightbox grows smoothly out of the preview and goes back into it; a click on the image zooms to the click point,
  and the zoomed image can be dragged with the mouse; hover and press feedback on previews and buttons. With "reduce
  motion" set in the system, there is only a soft fade-in.

Works in both "Brief" and "Detailed" views. The plugin has no network and no process.

The interface text is English by default and Russian when the hub language is Russian (`hub.lang`); any other language
falls back to English.

## Install

"Settings" → "Plugins" → paste the link to this repository → "Check and install". Needs a hub with plugin API 1.10.

## How it works

The plugin only decides the size: it watches the feed, counts a message's images and their size, and sets a class:
`ci-full` (as is) or `ci-thumb` (preview). The lightbox is the hub's own; the plugin only adds motion and pan to it.

## Tests

`python3 -m unittest discover -s tests` — standard library, no hub and no browser (`node` is used for the syntax check
and the subscription test when present).

Icon — [3D Fluency](https://icons8.com/icons/3d-fluency) by Icons8.
