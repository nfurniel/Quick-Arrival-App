import FirstPage from "./components/first-page/FirstPage.jsx"
import ClickSpark from "./components/ClickSpark.jsx"
import './app.css'

function App() {


  return (
    <ClickSpark sparkColor='#ff0000ff' sparkSize={10} sparkRadius={15} sparkCount={8} duration={400}>
      <FirstPage></FirstPage>
    </ClickSpark>
  )
}

export default App
