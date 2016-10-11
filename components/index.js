import React, { Component, PropTypes } from 'react';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import Immutable, { Record  } from 'immutable';

import * as allActionCreators from '../actions';
import { getKindAtIndex, getKindSorted } from '../util/annotext';

const languageOptions = [
  { value: 'ja', label: 'Japanese' },
  { value: 'en', label: 'English' },
];

const newlinesToBrs = s => s.split('\n').map((o, i) => <span key={i}>{o}<br/></span>);

// Select, "uncontrolled" but watches changes
class Select extends Component {
  componentWillMount() {
    const { options, onSet } = this.props;
    if (options.length > 0) {
      onSet(options[0].value);
    }
  }

  render() {
    const { options, onSet } = this.props;
    return (
      <select onChange={e => onSet(e.target.value)}>
        {options.map((o, i) => <option key={i} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
}

// ClipboardCopier
class ClipboardCopier extends Component {
  constructor(props) {
    super(props);
    this.onSubmit = this.onSubmit.bind(this);
  }

  onSubmit(e) {
    e.preventDefault();
    // TODO: could check input is set and input.select is truthy, and wrap copy+blur in a try block
    this.inputElem.select();
    document.execCommand('copy');
    this.inputElem.blur();
  }

  render() {
    const { text, buttonText } = this.props;
    return (
      <form onSubmit={this.onSubmit}>
        <input style={{ /*width: '2em'*/ }} type="text" value={text} readOnly ref={(el) => { this.inputElem = el; }} />
        <button type="submit">{buttonText}</button>
      </form>
    );
  }
}

// NewDocForm
const NewDocForm = connect()(
  class extends Component {
    render() {
      const kindOptions = [
        { value: 'video', label: 'Video' },
        { value: 'comic', label: 'Comic' },
      ];
      const { actions } = this.props;
      return (
        <form onSubmit={e => { e.preventDefault(); actions.newDoc(this.kindVal); }}>
          <Select options={kindOptions} onSet={v => { this.kindVal = v; }} />
          <button type="submit">Create New Document</button>
        </form>
      );
    }
  }
);

// FileChooserForm
const FileChooser = ({ label, accept, onChoose }) => (
  <label>{label} <input type="file" accept={accept} onChange={e => { onChoose(e.target.files[0]); e.target.value = null; }} /></label>
);

// VideoImportControls
class VideoImportControls extends Component {
  render() {
    const { actions } = this.props;
    return (
      <div>
        <form>
          <FileChooser label="Import Video" accept="video/*" onChoose={(file) => { actions.importVideoFile(file, this.videoLanguageVal); }} />
          <Select options={languageOptions} onSet={v => { this.videoLanguageVal = v; }} />
        </form>
        <form>
          <FileChooser label="Import Subs (SRT)" accept=".srt" onChoose={(file) => { actions.importSubsFile(file, this.subLanguageVal); }} />
          <Select options={languageOptions} onSet={v => { this.subLanguageVal = v; }} />
        </form>
      </div>
    );
  }
}

class VideoMedia extends Component {
  render() {
    const { media, onTimeUpdate, mountedVideoElement } = this.props;
    return (
      <div style={{ textAlign: 'center', backgroundColor: 'black' }}>{media.size ? (
        <video src={media.first().videoURL} controls onTimeUpdate={e => { onTimeUpdate(e.target.currentTime); }} ref={(el) => { mountedVideoElement(el); }} />
      ) : ''
      }</div>
    );
  }
}

class PlayControls extends Component {
  constructor(props) {
    super(props);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  componentDidMount() {
    document.body.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    document.body.removeEventListener('keydown', this.handleKeyDown);
  }

  handleKeyDown(e) {
    const { onBack, onTogglePause, onHideText, onRevealMoreText } = this.props;

    // console.log(e);
    if (!e.repeat) {
      switch (e.keyCode) {
        case 65: // a
          onBack();
          break;

        case 68: // d
          onHideText();
          break;

        case 70: // f
          onRevealMoreText();
          break;

        case 32: // space
          onTogglePause();
          break;

        default:
          // ignore
          break;
      }
    }
  }

  render() {
    const { onBack, onTogglePause, onHideText, onRevealMoreText } = this.props;
    return (
      <form style={{ textAlign: 'center', margin: '10px auto' }}>
        <button type="button" onClick={() => { onBack(); }}>Jump Back [A]</button>
        <button type="button" onClick={() => { onHideText(); }}>Hide Texts [D]</button>
        <button type="button" onClick={() => { onRevealMoreText(); }}>Reveal Next Text [F]</button>
        <button type="button" onClick={() => { onTogglePause(); }}>Play/Pause [Space]</button>
      </form>
    );
  }
}

const isAncestorNode = (potentialAncestor, given) => {
  let n = given;
  while (true) {
    if (n === potentialAncestor) {
      return true;
    }
    if (n.parentNode) {
      n = n.parentNode;
    } else {
      return false;
    }
  }
}

const renderAnnoTextToHTML = (annoText) => {
  const textArr = [...annoText.text.trim()]; // split up by unicode chars
  const sortedRubyAnnos = getKindSorted(annoText, 'ruby');

  let idx = 0;
  const pieces = [];
  for (const ra of sortedRubyAnnos) {
    if (ra.cpBegin < idx) {
      throw new Error('Overlapping ruby');
    }

    if (ra.cpBegin > idx) {
      pieces.push(escape(textArr.slice(idx, ra.cpBegin).join('')));
    }

    pieces.push('<ruby>' + escape(textArr.slice(ra.cpBegin, ra.cpEnd).join('')) + '<rp>(</rp><rt>' + escape(ra.data) + '</rt><rp>)</rp></ruby>');

    idx = ra.cpEnd;
  }

  // Handle remaining text
  if (idx < textArr.length) {
    pieces.push(escape(textArr.slice(idx, textArr.length).join('')));
  }

  // Join pieces
  const html = pieces.join('');

  // Convert newlines to breaks
  const brHtml = html.replace(/\n/g, '<br/>');

  return brHtml;
};

const CPRange = new Record({
  cpBegin: null,
  cpEnd: null,
});

class AnnoText extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selectionRange: null,
      inspectedIndex: null, // codepoint index of char we're doing a "tooltip" for
    };
    this.tooltipTimeout = null; // it does not work to have this in state
    this.handleSelectionChange = this.handleSelectionChange.bind(this);
    this.handleCharMouseEnter = this.handleCharMouseEnter.bind(this);
    this.handleCharMouseLeave = this.handleCharMouseLeave.bind(this);
  }

  componentDidMount() {
    document.addEventListener('selectionchange', this.handleSelectionChange);
  }

  componentWillUnmount() {
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    this.clearTooltipTimeout();
  }

  clearTooltipTimeout() {
    if (this.tooltipTimeout) {
      window.clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }
  }

  setTooltipTimeout() {
    if (this.tooltipTimeout) {
      window.clearTimeout(this.tooltipTimeout);
    }
    this.tooltipTimeout = window.setTimeout(
      () => { this.setState({ inspectedIndex: null }); this.tooltipTimeout = null; },
      500
    );
  }

  currentSelectionIndexRange() {
    const selObj = window.getSelection();
    if (selObj.isCollapsed) {
      return null;
    } else {
      const selRange = selObj.getRangeAt(0);
      const ancestorNode = selRange.commonAncestorContainer;
      if (isAncestorNode(this.textContainerElem, ancestorNode)) {
        const frag = selRange.cloneContents();

        if (ancestorNode.nodeType === Node.TEXT_NODE) {
          // If we selected text that is inside any element, we'll get a text node.
          // It might not be useful text (might be furigana), so need to check what element it's inside.
          // For now we can assume that its immediate parent will be a .textchar element if it's a good character.
          const parent = ancestorNode.parentNode;
          if (parent.classList.contains('textchar')) {
            const cpIndex = +parent.getAttribute('data-index');
            return new CPRange({cpBegin: cpIndex, cpEnd: cpIndex+1});
          } else {
            return null;
          }
        } else {
          const cpIndexes = [];

          // Iterate over all .textchar elems inside the fragment
          for (const el of frag.querySelectorAll('.textchar')) {
            // We might get extraneous .textchar elems that have nothing inside them. Only consider ones that have text inside.
            if (el.textContent.length > 0) {
              const cpIndex = +el.getAttribute('data-index');
              cpIndexes.push(cpIndex);
            }
          }

          if (cpIndexes.length === 0) {
            return null;
          } else {
            var minIndex = Math.min(...cpIndexes);
            var maxIndex = Math.max(...cpIndexes);
            if ((minIndex !== cpIndexes[0]) || (maxIndex !== cpIndexes[cpIndexes.length-1])) {
              throw new Error('Unexpected');
            }
            return new CPRange({cpBegin: minIndex, cpEnd: maxIndex+1});
          }
        }
      } else {
        return null;
      }
    }
  }

  handleSelectionChange(e) {
    const newSelRange = this.currentSelectionIndexRange();
    if (!Immutable.is(newSelRange, this.state.selectionRange)) {
      this.setState({selectionRange: newSelRange});
    }
  }

  handleCharMouseEnter(e) {
    const cpIndex = +e.currentTarget.getAttribute('data-index');
    this.setState({inspectedIndex: cpIndex});
    this.clearTooltipTimeout();
  }

  handleCharMouseLeave(e) {
    this.setTooltipTimeout();
  }

  render() {
    const { annoText, language } = this.props;

    const inspectedIndex = this.state.inspectedIndex;
    const hitLemmaInfoElems = [];
    const hitLemmaIndexes = new Set();
    if (inspectedIndex !== null) {
      const hitLemmaAnnos = getKindAtIndex(annoText, 'lemma', inspectedIndex);
      hitLemmaAnnos.forEach((lemmaAnno) => {
        var encLemma = encodeURIComponent(lemmaAnno.data);
        hitLemmaInfoElems.push(
          <span key={`wordinfo-${lemmaAnno.cpBegin}:${lemmaAnno.cpEnd}`}>{lemmaAnno.data}<br />
            <span style={{ fontSize: '0.5em' }}>
              <a className="dict-linkout" href={'http://ejje.weblio.jp/content/' + encLemma} target="_blank">Weblio</a>{' '}
              <a className="dict-linkout" href={'http://eow.alc.co.jp/search?q=' + encLemma} target="_blank">ALC</a>{' '}
              <a className="dict-linkout" href={'http://dictionary.goo.ne.jp/srch/all/' + encLemma + '/m0u/'} target="_blank">goo</a>{' '}
              <a className="dict-linkout" href={'http://tangorin.com/general/' + encLemma} target="_blank">Tangorin</a>
            </span>
          </span>
        );
      });
      hitLemmaAnnos.forEach((lemmaAnno) => {
        for (let i = lemmaAnno.cpBegin; i < lemmaAnno.cpEnd; i++) {
          hitLemmaIndexes.add(i);
        }
      });
    }

    const textRangeToElems = (cpBegin, cpEnd) => {
      const pieces = [];
      for (let i = cpBegin; i < cpEnd; i++) {
        const c = textArr[i];
        if (c === '\n') {
          pieces.push(<br key={`char-${i}`} />);
        } else {
          const isInspected = (i === inspectedIndex);

          const toolTipElem = (isInspected && (hitLemmaInfoElems.length > 0))
            ? <span style={{zIndex: 100}}><span className="textchar-tooltip">{hitLemmaInfoElems}</span><span className="textchar-tooltip-triangle"> </span></span>
            : '';

          const classNames = ['textchar'];
          if (isInspected) {
            classNames.push('inspected');
          } else if (hitLemmaIndexes.has(i)) {
            classNames.push('highlighted');
          }

          pieces.push(<span className={classNames.join(' ')} onMouseEnter={this.handleCharMouseEnter} onMouseLeave={this.handleCharMouseLeave} data-index={i} key={`char-${i}`}>{toolTipElem}{c}</span>);
        }
      }
      return pieces;
    };

    const children = [];
    const textArr = [...annoText.text.trim()]; // split up by unicode chars
    const sortedRubyAnnos = getKindSorted(annoText, 'ruby');

    let idx = 0;
    for (const ra of sortedRubyAnnos) {
      if (ra.cpBegin < idx) {
        throw new Error('Overlapping ruby');
      }

      if (ra.cpBegin > idx) {
        children.push(...textRangeToElems(idx, ra.cpBegin));
      }

      children.push(<ruby key={`ruby-${ra.cpBegin}:${ra.cpEnd}`}>{textRangeToElems(ra.cpBegin, ra.cpEnd)}<rp>(</rp><rt>{ra.data}</rt><rp>)</rp></ruby>);

      idx = ra.cpEnd;
    }

    // Handle remaining text
    if (idx < textArr.length) {
      children.push(...textRangeToElems(idx, textArr.length));
    }

    const floatWidth = '10em';
    return (
      <div>
        <div style={{ float: 'right', width: floatWidth, textAlign: 'left', backgroundColor: '#eee', padding: '10px' }}>
          <ClipboardCopier text={renderAnnoTextToHTML(annoText)} buttonText="Copy HTML" />
          {/*
          {this.state.selectionRange ? (
            <form>
              <button type="button" className="clear-ruby-button">Clear Ruby</button><br />
              <input className="set-ruby-text" placeholder="Ruby text" /><button type="button" className="set-ruby-button">Set Ruby</button><br />
              <button type="button" className="clear-words-button">Clear Words</button><br />
              <input className="mark-word-lemma" placeholder="Lemma (if not base form)" /><button type="button" className="mark-word-button">Mark Word</button>
            </form>
          ) : ''}
          */}
        </div>
        <div style={{ margin: '0 ' + floatWidth }} lang={language} ref={(el) => { this.textContainerElem = el; }}>{children}</div>
      </div>
    );
  }
}

const TextChunk = ({ chunk, language }) => (
  <AnnoText annoText={chunk.annoText} language={language} />
);

const TextChunksBox = ({ chunks, language, revealed }) => (
  <div className="studied-text-box">
    <div className="language-tag">{language.toUpperCase()}</div>
    <div>{chunks.map(c => (revealed ? <TextChunk chunk={c} key={c.uid} language={language} /> : <div key={c.uid} style={{color: '#ccc'}}>(hidden)</div>))}</div>
  </div>
);

// Doc
class Doc extends Component {
  constructor(props) {
    super(props);
    this.videoElement = null;
  }

  render() {
    const { doc, actions } = this.props;
    return (
      <div>
        <div id="doc-settings">
          <div>Kind: {doc.kind}</div>
          <VideoImportControls actions={actions} />
          <div>Media:</div>
          <ul>{doc.media.map((o, i) => <li key={i}>#{i} [{o.language}]</li>)}</ul>
          <div>Texts:</div>
          <ul>{doc.texts.map((o, i) => <li key={i}>#{i} [{o.language}]</li>)}</ul>
        </div>
        <VideoMedia media={doc.media} onTimeUpdate={time => { actions.videoTimeUpdate(time); }} mountedVideoElement={(el) => { this.videoElement = el; }} />
        <PlayControls actions={actions} onBack={
            () => {
              if (this.videoElement) {
                const nt = this.videoElement.currentTime - 3.0;
                this.videoElement.currentTime = nt >= 0 ? nt : 0;
              }
            }
          } onTogglePause={
            () => {
              if (this.videoElement) {
                if (this.videoElement.paused) {
                  this.videoElement.play();
                } else {
                  this.videoElement.pause();
                }
              }
            }
          } onHideText={
            () => {
              actions.hideText();
            }
          } onRevealMoreText={
            () => {
              actions.revealMoreText();
            }
          }
        />
        {doc.texts.map((text, i) => <TextChunksBox key={i} chunks={text.currentChunks} language={text.language} revealed={doc.textRevelation > i} />)}
      </div>
    );
  }
}

// App
const App = connect(
  state => ({
    doc: state.doc,
  }),
  dispatch => ({
    actions: bindActionCreators(allActionCreators, dispatch),
  })
)(({ doc, actions }) => (
  doc ? (
    <Doc doc={doc} actions={actions} />
  ) : (
    <NewDocForm actions={actions} />
  )
));

export default App;
