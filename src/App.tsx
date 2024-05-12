import "./App.css";
import { toggleIconDictionary } from "./assets/icons/toggle";
import { IconBackup } from "./assets/icons/action";
import { useState } from "react";
import MyIcon from "./components/MyIcon";

function App() {
  const [rotate, setRotate] = useState(0);

  return (
    <>
      <div>
        <pre>No props</pre>
        <div>
          {Object.keys(toggleIconDictionary).map((key) => (
            <MyIcon key={key} svg={toggleIconDictionary[key]} />
          ))}
        </div>
      </div>
      <div>
        <pre>
          size=96
          <br />
          color="red"
          <br />
          hoveredColor="orange"
          <br />
          rotate is updated on click
        </pre>
        <div>
          <MyIcon
            svg={IconBackup}
            size={96}
            color="red"
            hoveredColor="orange"
            rotate={rotate}
            onClick={() => setRotate(rotate + 90)}
          />
        </div>
      </div>
    </>
  );
}

export default App;
