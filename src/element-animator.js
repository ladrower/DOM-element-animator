/**
 The MIT License (MIT)

 Copyright (c) 2014-2016 Artem Platonov

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */

"use strict";

export default {
  take: function(element) {
    let instance = animators.get(element);

    !(instance instanceof ElementAnimator) && animators.set(element, instance = new ElementAnimator(element));

    return instance;
  }
}

const
  animators = new WeakMap(),
  unitRegexp = /^(-?[\d.]*)([\s\S]*?)$/i,
  vendors = ['ms', 'moz', 'webkit', 'o'],
  cssUnitless = {
    columnCount: true,
    fillOpacity: true,
    fontWeight: true,
    lineHeight: true,
    opacity: true,
    order: true,
    orphans: true,
    widows: true,
    zIndex: true,
    zoom: true
  },
  elementUnitless = {
    scrollTop: true,
    scrollLeft: true
  };

const
  isAnimationFrameBroken = (agent = navigator.userAgent) => ~agent.indexOf('Safari') && !~agent.indexOf('Chrome'),
  toCamelCase = s => s.replace(/(\-[a-z])/g, $1 => $1.toUpperCase().replace('-','')),
  noop = () => {},
  getEasingFunction = (easing) => {
    switch (typeof easing) {
      case 'string':
        return (easing in easingFunctions) ? easingFunctions[easing] : easingFunctions.swing;
      case 'function':
        return easing;
      default:
        return easingFunctions.swing;
    }
  },
  easingFunctions = {
    linear: function (t, b, c, d) {
      return c * t / d + b;
    },
    swing: function (t, b, c, d) {
      return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
    }
  };

function ElementAnimator (element) {
  let queue = [],
    requestID,
    queueInterval,
    requestAnimationFrame = window.requestAnimationFrame,
    cancelAnimationFrame = window.cancelAnimationFrame,
    vendorIndex = 0;

  for (; vendorIndex < vendors.length && !requestAnimationFrame; ++vendorIndex) {
    requestAnimationFrame = window[vendors[vendorIndex]+'RequestAnimationFrame'];
    cancelAnimationFrame = window[vendors[vendorIndex]+'CancelAnimationFrame'];
  }

  if (!requestAnimationFrame || isAnimationFrameBroken())  {
    requestAnimationFrame = callback => window.setTimeout(() => callback(), 0);
    cancelAnimationFrame = id => window.clearTimeout(id);
  }

  /**
   * Animate
   * @param {!Object} prop css properties key-value pairs
   * @param {Number=0} duration
   * @param {(String|Function)=} easing Special easing method
   * @param {Function=} callback
   * @returns {ElementAnimator}
   */
  this.animate = (prop, duration = 0, easing, callback = noop) => {
    let properties = [], keys = Object.keys(prop), i = keys.length;

    while (i--) {
      let propName = toCamelCase(keys[i]), defaultUnit = cssUnitless[propName] || elementUnitless[propName] ? "" : "px";
      properties.push({
        propertyName: propName,
        startValue: undefined,
        destinationValue: parseFloat(prop[keys[i]]) || 0,
        unit: (typeof prop[keys[i]] === 'string') ? prop[keys[i]].match(unitRegexp)[2] || defaultUnit : defaultUnit
      });
    }

    queue.push({
      animatedProperties: properties,
      duration,
      easing,
      callback,
      started: false,
      finished: false,
      startTime: undefined
    });

    processAnimationQueue();
    return this;
  };

  /**
   * Stop currently running animation
   * @param {Boolean=} clearQueue
   * @returns {ElementAnimator}
   */
  this.stop = clearQueue => {
    cancelFrame();
    if (clearQueue) {
      queue.length = 0;
    } else {
      queue.shift();
    }
    return this;
  };

  /**
   * Immediately finish all queued animations
   * @returns {ElementAnimator}
   */
  this.finish = () => {
    cancelFrame();
    queue.forEach(animation => setValues(animation));
    queue.length = 0;
    return this;
  };

  function cancelFrame() {
    if (requestID) {
      cancelAnimationFrame(requestID);
      requestID = null;
    }
  }

  function stopQueueInterval() {
    if (queueInterval) {
      window.clearInterval(queueInterval);
      queueInterval = null;
    }
  }

  function processAnimationQueue() {
    let process = () => {
      if (queue.length) {
        if (!queue[0].started) {
          if (!queue[0].duration) {
            setValues(queue[0]);
            queue[0].callback();
            queue.shift();
          } else {
            startAnimation(queue[0]);
          }
        } else if (queue[0].finished) {
          queue[0].callback();
          queue.shift();
        }
      } else {
        stopQueueInterval();
      }
    };

    process();
    stopQueueInterval();
    queueInterval = window.setInterval(process, 0);
  }

  function startAnimation(animation) {
    var i = animation.animatedProperties.length,
      startProp,
      startValue,
      scale;
    while (i--) {
      scale = 1;
      startProp = getValue(animation.animatedProperties[i].propertyName);
      startValue = parseFloat(startProp);
      if (startValue !== 0 && (startProp+'').match(unitRegexp)[2] !== animation.animatedProperties[i].unit) {
        setValue(animation.animatedProperties[i].propertyName, startValue + animation.animatedProperties[i].unit);
        scale = parseFloat(getValue(animation.animatedProperties[i].propertyName)) / startValue;
        setValue(animation.animatedProperties[i].propertyName, startProp);
      }
      animation.animatedProperties[i].startValue = startValue/scale;
    }
    animation.startTime = Date.now();
    animation.started = true;

    animate();
  }

  function animate() {
    requestID = requestAnimationFrame(animationStep);
  }

  function animationStep() {
    if (!queue.length || !queue[0].started || queue[0].finished) {
      return;
    }

    var animation = queue[0],
      currentTime = Date.now();

    if (currentTime >= animation.startTime + animation.duration ) {
      setValues(animation);
      animation.finished = true;
    } else {
      setValues(animation, currentTime);
      animate();
    }
  }

  function setValues(animation, time) {
    let i = animation.animatedProperties.length;

    if (time) {
      let easingFunction = getEasingFunction(animation.easing), t, b, c, d;
      while(i--) {
        t = time - animation.startTime;
        b = animation.animatedProperties[i].startValue;
        c = animation.animatedProperties[i].destinationValue - animation.animatedProperties[i].startValue;
        d = animation.duration;
        setValue(animation.animatedProperties[i].propertyName, easingFunction(t, b, c, d) + animation.animatedProperties[i].unit);
      }
    } else {
      while(i--) {
        setValue(animation.animatedProperties[i].propertyName, animation.animatedProperties[i].destinationValue + animation.animatedProperties[i].unit);
      }
    }
  }

  function setValue(prop, val) {
    if (prop in elementUnitless) {
      element[prop] = val;
    } else {
      element.style[prop] = val;
    }
  }

  function getValue(prop) {
    return prop in elementUnitless ? element[prop] : window.getComputedStyle(element, null).getPropertyValue(prop);
  }
}
